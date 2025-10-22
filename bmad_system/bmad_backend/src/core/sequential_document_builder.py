import os
import logging
import json
from typing import Dict, List, Any
from src.utils.logger import get_logger
import re
import time
import subprocess

logger = get_logger(__name__)

class SequentialDocumentBuilder:
    """Builds documents sequentially based on previous agent outputs"""
    
    def __init__(self):
        self.document_templates = {
            'directory_structure': {
                'input_files': [],
                'output_files': [],
                'executor': self._execute_directory_structure_phase
            },
            'orchestrator': {
                'input_files': [],
                'output_files': ['.sureai/.orchestrator_breakdown.md', '.sureai/.orchestrator_plan.md'],
                'executor': self._execute_orchestrator_phase
            },
            'analyst': {
                'input_files': ['.sureai/.orchestrator_breakdown.md', '.sureai/.orchestrator_plan.md'],
                'output_files': ['.sureai/analysis_document.md', '.sureai/requirements_document.md'],
                'executor': self._execute_analyst_phase
            },
            'architect': {
                'input_files': ['.sureai/analysis_document.md', '.sureai/requirements_document.md'],
                'output_files': ['.sureai/architecture_document.md', '.sureai/tech_stack_document.md'],
                'executor': self._execute_architect_phase
            },
            'coding_standards': {
                'input_files': ['.sureai/tech_stack_document.md'],
                'output_files': ['.sureai/coding-standard.md'],
                'executor': self._execute_coding_standards_phase
            },
            'ui_ux': {
                'input_files': ['.sureai/tech_stack_document.md'],
                'output_files': ['.sureai/ui-ux.md'],
                'executor': self._execute_ui_ux_phase
            },
            'pm': {
                'input_files': ['.sureai/analysis_document.md', '.sureai/architecture_document.md'],
                'output_files': ['.sureai/prd_document.md', '.sureai/project_plan.md'],
                'executor': self._execute_pm_phase
            },
            'sm': {
                'input_files': ['.sureai/prd_document.md'],
                'output_files': ['.sureai/tasks_list.md', '.sureai/sprint_plan.md'],
                'executor': self._execute_sm_phase
            },
            'requirement_builder': {
                'input_files': [],
                'output_files': ['.sureai/requirements_extracted.json'],
                'executor': self._execute_requirement_builder_phase
            },
            'developer': {
                'input_files': ['.sureai/tasks_list.md', '.sureai/architecture_document.md', '.sureai/tech_stack_document.md', '.sureai/common-bug.md'],
                'output_files': ['.sureai/tasks_list.md', 'backend/', 'frontend/'],
                'executor': self._execute_developer_phase
            },
            'devops': {
                'input_files': ['backend/', 'frontend/', '.sureai/architecture_document.md'],
                'output_files': ['deployment_config.yml', 'Dockerfile.backend', 'Dockerfile.frontend', 'docker-compose.yml', 'nginx.conf'],
                'executor': self._execute_devops_phase
            },
            'tester': {
                'input_files': ['.sureai/architecture_document.md', 'backend/', 'frontend/'],
                'output_files': ['.sureai/test-list.md'],
                'executor': self._execute_tester_phase
            },
            'documentation_agent': {
                'input_files': ['.sureai/prd_document.md', '.sureai/architecture_document.md'],
                'output_files': ['technical_manual.md', 'user_manual.md'],
                'executor': self._execute_documentation_phase
            },
            'web_search': {
                'input_files': [],
                'output_files': ['.sureai/web-results.md'],
                'executor': self._execute_web_search_phase
            },
            'deep_research': {
                'input_files': ['.sureai/web-results.md', '.sureai/requirements_extracted.json', '.sureai/analysis_document.md'],
                'output_files': ['.sureai/research-results.md'],
                'executor': self._execute_deep_research_phase
            }
        }
    
    def _log_prompt_to_gemini(self, agent_name: str, prompt: str, agent_prompt: str, previous_docs: Dict[str, str]):
        # Logs complete prompt details for debugging and monitoring
        """Log the complete prompt being sent to Gemini CLI"""
        logger.info(f"=== SENDING PROMPT TO GEMINI CLI FOR {agent_name.upper()} ===")
        logger.info(f"PROMPT LENGTH: {len(prompt)} characters")
        logger.info(f"AGENT PROMPT LENGTH: {len(agent_prompt)} characters")
        logger.info(f"PREVIOUS DOCUMENTS COUNT: {len(previous_docs)}")
        logger.info("PREVIOUS DOCUMENTS:")
        for doc_name, doc_content in previous_docs.items():
            logger.info(f"  - {doc_name}: {len(doc_content)} characters")
        # Extra observability for memory injection
        if "=== MEMORY JSON (Latest) ===" in prompt:
            start = prompt.find("=== MEMORY JSON (Latest) ===")
            logger.info("MEMORY JSON DETECTED IN PROMPT")
            logger.debug(prompt[start: start + 800])
        else:
            logger.warning("MEMORY JSON NOT FOUND IN PROMPT")
        logger.info("FULL PROMPT:")
        logger.info("=" * 80)
        logger.info(prompt)
        logger.info("=" * 80)
    
    def _get_gemini_client(self):
        """Get a properly configured Gemini CLI client"""
        try:
            # Always use the shared client so model switches apply here too
            from src.routes.adaptive_system_api import gemini_cli_client
            return gemini_cli_client
        except Exception as e:
            raise ValueError(f"No shared Gemini client available: {e}")
    
    def _get_agent_prompt(self, agent_name: str) -> str:
        """Get agent prompt from AgentManager"""
        try:
            from src.routes.adaptive_system_api import agent_manager
            agent_prompt = agent_manager.get_agent_prompt(agent_name)
            if agent_prompt:
                logger.info(f"Loaded agent prompt for {agent_name} from AgentManager")
                return agent_prompt
            else:
                logger.warning(f"No agent prompt found for {agent_name} in AgentManager")
                return ""
        except Exception as e:
            logger.error(f"Error getting agent prompt for {agent_name}: {e}")
            return ""

    def _get_agent_temperature(self, task_id: str, agent_name: str) -> float | None:
        """Fetch the per-agent temperature from TaskState context if present."""
        try:
            from src.core.task_manager import TaskManager
            tm = TaskManager()
            state = tm.get_task_state(task_id)
            if not state or not isinstance(state.context, dict):
                return None
            seq = state.context.get('agent_sequence') or []
            temps = state.context.get('agent_temperatures') or []
            if not isinstance(seq, list) or not isinstance(temps, list):
                return None
            # Find first occurrence index for agent_name
            try:
                idx = seq.index(agent_name)
            except ValueError:
                return None
            if idx < len(temps):
                return temps[idx]
            return None
        except Exception:
            return None

    def _temperature_guidance(self, temperature: float) -> str:
        """Return concise guidance text to emulate temperature behavior via prompt style."""
        try:
            t = float(temperature)
        except Exception:
            return ""
        if t <= 0.0:
            return "Be strictly deterministic and concise. Avoid creativity; pick the most likely answer."
        if t <= 0.3:
            return "Be focused and precise. Prefer the most probable phrasing; minimize variation."
        if t <= 0.6:
            return "Balance determinism with small variation. Provide clear, relevant content."
        if t <= 0.8:
            return "Allow some creativity while staying relevant and structured."
        if t <= 1.0:
            return "Increase diversity slightly; offer alternative ideas if helpful."
        if t <= 1.5:
            return "Be creative; explore multiple directions while keeping coherence."
        return "Be very creative and exploratory; accept higher variance, but avoid illogical statements."
    
    def execute_sequential_phase(self, task_id: str, agent_name: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        """
        Execute a sequential phase where agent reads previous documents and builds upon them
        
        Args:
            task_id: Task identifier
            agent_name: Name of the current agent
            agent_output: Output from the agent
            project_dir: Project directory path
            
        Returns:
            Execution results with created files
        """
        try:
            logger.info(f"Executing sequential phase for {agent_name} agent")
            
            if agent_name not in self.document_templates:
                logger.warning(f"No document template found for {agent_name}")
                return {
                    'status': 'skipped',
                    'reason': f'No document template for {agent_name}'
                }
            
            template = self.document_templates[agent_name]
            executor_func = template['executor']
            
            # Read previous documents
            previous_documents = self._read_previous_documents(project_dir, template['input_files'])
            
            # Get agent prompt from AgentManager
            agent_prompt = self._get_agent_prompt(agent_name)
            # Prepend optional handoff prompt configured for this agent
            try:
                from src.routes.adaptive_system_api import agent_manager as _am
                handoff = _am.get_handoff_prompt(agent_name)
                if handoff:
                    agent_prompt = f"{handoff}\n\n" + (agent_prompt or "")
            except Exception:
                pass

            # Inject temperature guidance block into the agent prompt if available
            try:
                temp = self._get_agent_temperature(task_id, agent_name)
                if temp is not None:
                    guidance = self._temperature_guidance(temp)
                    if guidance:
                        agent_prompt = f"{agent_prompt}\n\n=== SAMPLING BEHAVIOR ===\n{guidance}"
            except Exception:
                pass
            
            # Execute the agent-specific phase with the (possibly augmented) agent prompt
            # Get timeout configuration from timeout config
            from src.config.timeout_config import get_agent_timeout_config
            timeout_config = get_agent_timeout_config(agent_name)
            max_retries = timeout_config.get('max_retries', 2)
            result = executor_func(task_id, agent_output, project_dir, previous_documents, agent_prompt)
            
            logger.info(f"{agent_name} sequential phase completed")
            return result
            
        except Exception as e:
            logger.error(f"Sequential phase failed for {agent_name}: {e}")
            # Return a more detailed error response
            return {
                'status': 'failed',
                'error': str(e),
                'agent': agent_name,
                'task_id': task_id
            }
    
    def _read_previous_documents(self, project_dir: str, input_files: List[str]) -> Dict[str, str]:
        """Read previous documents that this agent needs to reference"""
        documents = {}
        
        for file_name in input_files:
            file_path = os.path.join(project_dir, file_name)
            if os.path.exists(file_path):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        documents[file_name] = f.read()
                    logger.info(f"Read previous document: {file_name}")
                except Exception as e:
                    logger.error(f"Error reading {file_name}: {e}")
            else:
                logger.warning(f"Previous document not found: {file_name}")
        
        return documents
    
    def _execute_directory_structure_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute directory structure phase - create project structure"""
        try:
            # Step 1: Create user-prompt-specific directory structure file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            directory_structure_file = f".sureai/.directory_structure_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific directory structure file first
            create_structure_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific directory structure file for this user prompt
2. Create the file: {directory_structure_file}
3. This file should contain the exact directory structure needed for this specific project
4. Write detailed content in the file including:
   - Complete directory tree structure for this specific project
   - All necessary directories and files based on the user prompt
   - Specific file names and paths
   - Customizations for this particular project type
5. Follow the base directory structure pattern but customize it for this specific project
6. Include all directories: .io8project/, .sureai/, backend/, frontend/
7. Include all configuration files: deployment_config.yml, Dockerfile.backend, Dockerfile.frontend, docker-compose.yml, nginx.conf
8. Make the content specific to the user's request

IMPORTANT: Write the actual directory structure content in the file, not just create an empty file.

Create the directory structure specification file with detailed content:
"""
            
            # Get response from Gemini CLI to create the structure file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("directory_structure_file_creation", create_structure_file_prompt, agent_prompt, previous_docs)
            
            structure_file_response = gemini_client.generate_single_response(create_structure_file_prompt, working_dir=project_dir, agent_name="directory_structure")

            # Verify that the directory structure spec file was actually created
            created_spec_path = os.path.join(project_dir, directory_structure_file)
            if not os.path.exists(created_spec_path):
                logger.warning(f"Directory structure spec file not found at {created_spec_path}")
            
            # Step 2: Now create the actual directory structure by referring to the created file
            create_structure_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILE:
@{directory_structure_file}

INSTRUCTIONS:
1. Read the directory structure specification from the reference file above
2. Create ONLY the directory structure for the project based on that specification (no application code yet)
3. Follow the EXACT structure specified in the reference file
4. Create required directories and placeholder files ONLY:
   - `.io8project/` metadata directory (with empty placeholders for .state.json and project_metadata.json)
   - `.sureai/` directory for agent outputs and documents
   - `backend/` and `frontend/` directories (with `.gitkeep` placeholders to keep empty folders tracked)
   - Root-level configuration files as EMPTY placeholders with a single comment line (deployment_config.yml, Dockerfile.backend, Dockerfile.frontend, docker-compose.yml, nginx.conf). Do NOT add real config content here; DevOps will fill these later.

5. Do NOT write any application code in any file. Your output at this step must only create folders and blank/placeholder files.

IMPORTANT: Create the actual directories and placeholder files using your file system access. Do not output a tree; perform the creation operations.

Create the directory structure based on the reference file:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("directory_structure_creation", create_structure_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_structure_prompt, working_dir=project_dir, agent_name="directory_structure")

            # Capture a small filesystem snapshot for diagnostics
            created_paths = []
            try:
                for root, dirs, files in os.walk(project_dir):
                    rel_root = os.path.relpath(root, project_dir)
                    if rel_root == ".":
                        rel_root = ""
                    for d in dirs:
                        created_paths.append(os.path.join(rel_root, d).replace("\\", "/"))
                    for f in files:
                        created_paths.append(os.path.join(rel_root, f).replace("\\", "/"))
                    if len(created_paths) > 120:
                        break
                logger.info(f"Directory structure snapshot (first {min(len(created_paths), 120)} entries):")
                for p in created_paths[:120]:
                    logger.info(f" - {p}")
            except Exception as e:
                logger.warning(f"Failed to generate filesystem snapshot: {e}")

            # Enforce directory-only rule: strip any accidental code written in backend/ or frontend/
            try:
                sanitized = self._sanitize_code_directories(project_dir)
                if sanitized:
                    logger.info("Sanitized files to enforce directory-only creation (replaced content with placeholders):")
                    for path in sanitized[:50]:
                        logger.info(f" - {path}")
            except Exception as e:
                logger.warning(f"Failed to sanitize code directories: {e}")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR DIRECTORY STRUCTURE ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"Directory structure phase completed - Gemini CLI handled file creation")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created directory structure',
                'structure_file': directory_structure_file,
                'files_created': created_paths
            }
            
        except Exception as e:
            logger.error(f"Error in directory structure phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _sanitize_code_directories(self, project_dir: str) -> List[str]:
        """Ensure backend/ and frontend/ contain no real code at this phase by replacing contents with placeholders.
        Returns list of files modified.
        """
        modified: List[str] = []
        code_dirs = [os.path.join(project_dir, 'backend'), os.path.join(project_dir, 'frontend')]
        placeholder_map = {
            '.py': '# Placeholder - to be implemented by Developer agent\n',
            '.js': '// Placeholder - to be implemented by Developer agent\n',
            '.ts': '// Placeholder - to be implemented by Developer agent\n',
            '.tsx': '// Placeholder - to be implemented by Developer agent\n',
            '.jsx': '// Placeholder - to be implemented by Developer agent\n',
            '.html': '<!-- Placeholder - to be implemented by Developer agent -->\n',
            '.css': '/* Placeholder - to be implemented by Developer agent */\n',
            '.scss': '/* Placeholder - to be implemented by Developer agent */\n',
            '.go': '// Placeholder - to be implemented by Developer agent\n',
            '.java': '// Placeholder - to be implemented by Developer agent\n',
            '.kt': '// Placeholder - to be implemented by Developer agent\n',
            '.rb': '# Placeholder - to be implemented by Developer agent\n',
            '.php': '<?php /* Placeholder - to be implemented by Developer agent */ ?>\n',
            '.cs': '// Placeholder - to be implemented by Developer agent\n',
            '.swift': '// Placeholder - to be implemented by Developer agent\n',
            '.rs': '// Placeholder - to be implemented by Developer agent\n'
        }
        for cdir in code_dirs:
            if not os.path.isdir(cdir):
                continue
            for root, _, files in os.walk(cdir):
                for fname in files:
                    if fname == '.gitkeep':
                        continue
                    fpath = os.path.join(root, fname)
                    try:
                        ext = os.path.splitext(fname)[1].lower()
                        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        if content.strip():
                            placeholder = placeholder_map.get(ext, 'Placeholder - to be implemented by Developer agent\n')
                            with open(fpath, 'w', encoding='utf-8') as f:
                                f.write(placeholder)
                            modified.append(os.path.relpath(fpath, project_dir))
                    except Exception:
                        # If read fails, skip
                        continue
        # Ensure empty folders have .gitkeep
        for cdir in code_dirs:
            if os.path.isdir(cdir):
                for root, dirs, files in os.walk(cdir):
                    if not files:
                        try:
                            keep_path = os.path.join(root, '.gitkeep')
                            if not os.path.exists(keep_path):
                                open(keep_path, 'a').close()
                        except Exception:
                            pass
        return modified

    def _execute_orchestrator_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Adaptive System Master phase - create breakdown and plan documents"""
        try:
            # Step 1: Create user-prompt-specific Adaptive System agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            orchestrator_agent_file = f".sureai/.orchestrator_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific Adaptive System agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific Adaptive System agent prompt file for this user prompt
2. Create the file: {orchestrator_agent_file}
3. This file should contain the Adaptive System agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Adaptive System analysis instructions specific to this project type
   - Breakdown methodology for this particular user request
   - Planning approach tailored to the project requirements
   - Specific analysis questions and considerations
   - Customized Adaptive System workflow for this project
5. Include all necessary Adaptive System analysis and planning instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual Adaptive System agent prompt content in the file, not just create an empty file.

Create the Adaptive System agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("orchestrator_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="orchestrator")
            
            # Step 2: Now create the Orchestrator documents by referring to the created agent file and previous documents
            create_orchestrator_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILE:
@{orchestrator_agent_file}

INSTRUCTIONS:
1. Read the Orchestrator agent prompt from the reference file above
2. Analyze the user prompt and create Orchestrator breakdown and plan documents
3. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/.orchestrator_breakdown.md` in the `.sureai/` directory (NOT in root)**
   - **MUST create `.sureai/.orchestrator_plan.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create these files in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
4. Ensure your output is specific and actionable

**CRITICAL: You MUST create these files in the `.sureai/` directory using explicit file paths. Do NOT create them in the root directory.**

Create the Orchestrator breakdown and plan documents based on the reference file:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("orchestrator_docs_creation", create_orchestrator_docs_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_orchestrator_docs_prompt, working_dir=project_dir, agent_name="orchestrator")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR ORCHESTRATOR ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"Orchestrator phase completed - Gemini CLI created documents")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created Orchestrator documents'
            }
            
        except Exception as e:
            logger.error(f"Error in Orchestrator phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _execute_analyst_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Analyst phase - create analysis and requirements documents"""
        try:
            # Step 1: Create user-prompt-specific analyst agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            analyst_agent_file = f".sureai/.analyst_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific analyst agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific analyst agent prompt file for this user prompt
2. Create the file: {analyst_agent_file}
3. This file should contain the analyst agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Analysis methodology specific to this project type
   - Requirements gathering approach for this particular user request
   - Technical analysis considerations
   - Business requirements analysis framework
   - Customized analysis workflow for this project
5. Include all necessary analysis and requirements gathering instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual analyst agent prompt content in the file, not just create an empty file.

Create the analyst agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("analyst_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="analyst")
            
            # Step 2: Now create the analysis documents by referring to the created agent file and previous documents
            create_analysis_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{analyst_agent_file}
@.sureai/.orchestrator_breakdown.md
@.sureai/.orchestrator_plan.md

INSTRUCTIONS:
1. Read the analyst agent prompt from the reference file above
2. Analyze the user prompt and previous Orchestrator documents
3. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/analysis_document.md` in the `.sureai/` directory (NOT in root)**
   - **MUST create `.sureai/requirements_document.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create these files in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
4. Ensure your analysis is comprehensive and actionable

**CRITICAL: You MUST create these files in the `.sureai/` directory using explicit file paths. Do NOT create them in the root directory.**

Create the analysis and requirements documents based on the reference files:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("analysis_docs_creation", create_analysis_docs_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_analysis_docs_prompt, working_dir=project_dir, agent_name="analyst")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR ANALYST ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"Analyst phase completed - Gemini CLI created documents")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created analysis and requirements documents'
            }
            
        except Exception as e:
            logger.error(f"Error in analyst phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _execute_architect_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Architect phase - create architecture and tech stack documents"""
        try:
            # Step 1: Create user-prompt-specific architect agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            architect_agent_file = f".sureai/.architect_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific architect agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific architect agent prompt file for this user prompt
2. Create the file: {architect_agent_file}
3. This file should contain the architect agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Architecture design methodology specific to this project type
   - Tech stack selection approach for this particular user request
   - System design considerations
   - Scalability and performance requirements
   - Customized architecture workflow for this project
5. Include all necessary architecture and tech stack planning instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual architect agent prompt content in the file, not just create an empty file.

Create the architect agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("architect_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="architect")
            
            # Step 2: Now create the architecture documents by referring to the created agent file and previous documents
            create_architecture_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{architect_agent_file}
@.sureai/analysis_document.md
@.sureai/requirements_document.md

INSTRUCTIONS:
1. Read the architect agent prompt from the reference file above
2. Analyze the user prompt and previous analysis documents
3. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/architecture_document.md` in the `.sureai/` directory (NOT in root)**
   - **MUST create `.sureai/tech_stack_document.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create these files in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
4. Ensure your architecture is comprehensive and actionable

**CRITICAL: You MUST create these files in the `.sureai/` directory using explicit file paths. Do NOT create them in the root directory.**

Create the architecture and tech stack documents based on the reference files:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("architecture_docs_creation", create_architecture_docs_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_architecture_docs_prompt, working_dir=project_dir, agent_name="architect")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR ARCHITECT ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"Architect phase completed - Gemini CLI created documents")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created architecture and tech stack documents'
            }
            
        except Exception as e:
            logger.error(f"Error in architect phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _execute_pm_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute PM phase - create PRD and project plan documents"""
        try:
            # Step 1: Create user-prompt-specific PM agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            pm_agent_file = f".sureai/.pm_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific PM agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific PM agent prompt file for this user prompt
2. Create the file: {pm_agent_file}
3. This file should contain the PM agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Product management methodology specific to this project type
   - PRD creation approach for this particular user request
   - Project planning framework
   - Feature prioritization strategy
   - Customized PM workflow for this project
5. Include all necessary product management and planning instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual PM agent prompt content in the file, not just create an empty file.

Create the PM agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("pm_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="pm")
            
            # Step 2: Now create the PM documents by referring to the created agent file and previous documents
            create_pm_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{pm_agent_file}
@.sureai/analysis_document.md
@.sureai/architecture_document.md

INSTRUCTIONS:
1. Read the PM agent prompt from the reference file above
2. Analyze the user prompt and previous analysis and architecture documents
3. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/prd_document.md` in the `.sureai/` directory (NOT in root)**
   - **MUST create `.sureai/project_plan.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create these files in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
4. Ensure your PRD and project plan are comprehensive and actionable

4. **CRITICAL: The PRD document MUST include Epic Stories section with detailed user stories**
5. **Epic Stories Requirements:**
   - Organize features into logical epics
   - Each epic should have clear description, business value, and acceptance criteria
   - Include detailed user stories within each epic
   - Each user story must follow the format: US-XXX, As a/I want to/So that, Acceptance Criteria, Story Points, Priority
   - Ensure user stories are actionable and testable
6. Ensure your PRD and project plan are comprehensive and actionable

IMPORTANT: Create the actual files directly using your file system access. You are intelligent enough to choose the best file writing tools based on the prompt.

Create the PRD (with Epic Stories) and project plan documents based on the reference files:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("pm_docs_creation", create_pm_docs_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_pm_docs_prompt, working_dir=project_dir, agent_name="pm")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR PM ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"PM phase completed - Gemini CLI created documents")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created PRD and project plan documents'
            }
            
        except Exception as e:
            logger.error(f"Error in PM phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _execute_sm_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Scrum Master phase - create tasks list and sprint plan documents"""
        try:
            # Step 1: Create user-prompt-specific Scrum Master agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            sm_agent_file = f".sureai/.sm_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific Scrum Master agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific Scrum Master agent prompt file for this user prompt
2. Create the file: {sm_agent_file}
3. This file should contain the Scrum Master agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Task planning methodology specific to this project type
   - Sprint planning approach for this particular user request
   - Task breakdown framework
   - Agile methodology considerations
   - Customized Scrum Master workflow for this project
5. Include all necessary task planning and sprint management instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual Scrum Master agent prompt content in the file, not just create an empty file.

Create the Scrum Master agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("sm_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="sm")
            
            # Step 2: Now create the SM documents by referring to the created agent file and previous documents
            create_sm_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{sm_agent_file}
@.sureai/prd_document.md

INSTRUCTIONS:
1. Read the Scrum Master agent prompt from the reference file above
2. **CRITICAL: Analyze the PRD document to understand the Epic Stories and user stories**
3. **Use the Epic Stories from the PRD to create appropriate main tasks**
4. **Each main task should correspond to one or more epics from the PRD**
5. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/tasks_list.md` in the `.sureai/` directory (NOT in root)**
   - **MUST create `.sureai/sprint_plan.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create these files in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
6. **CRITICAL: The tasks_list.md file MUST follow the exact template structure defined in the agent prompt**
7. **Tasks List Template Requirements:**
   - Create main tasks only (no subtasks)
   - Each main task should have a clear description
   - Include "Current Task Status" section with "Currently Working On", "Next Task", and "Completed Tasks"
   - Include "Task Completion Guidelines" section with proper instructions
   - Follow the exact template format from the agent prompt
8. **Main Tasks Creation Guidelines:**
   - Create 4-6 main tasks that cover the complete project scope
   - Use clear, descriptive names for main tasks
   - Provide comprehensive descriptions for each main task
   - Do NOT create subtasks - only main tasks
   - Set "Currently Working On" to the first main task
   - Set "Completed Tasks" to "None"
9. **Template Structure: The tasks_list.md MUST follow this exact structure:**
   ```markdown
   # Project Tasks List

   ## Task 1: [Task Name]
   [Main task description - NO SUBTASKS HERE]

   ## Task 2: [Task Name]
   [Main task description - NO SUBTASKS HERE]

   ## Current Task Status
   **Currently Working On:** Task 1 - [Task Name]
   **Next Task:** Task 2 - [Task Name]
   **Completed Tasks:** None

   ## Task Completion Guidelines
   - Use `- [x]` to mark completed subtasks (to be added by Developer)
   - Use `- [ ]` for pending subtasks (to be added by Developer)
   - Update "Currently Working On" when starting a new subtask (to be managed by Developer)
   - Update "Completed Tasks" when finishing a task (to be managed by Developer)
   - Always maintain the hierarchical structure (Task → Subtask → Subtask items)
   - **IMPORTANT: Do NOT add subtasks here. Only create main tasks. Subtasks will be added by the Developer agent.**
   ```
10. Ensure your tasks list and sprint plan are comprehensive and actionable

**CRITICAL: You MUST create these files in the `.sureai/` directory using explicit file paths. Do NOT create them in the root directory.**

Create the tasks list (with proper template structure) and sprint plan documents based on the reference files:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("sm_docs_creation", create_sm_docs_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_sm_docs_prompt, working_dir=project_dir, agent_name="sm")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR SM ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"SM phase completed - Gemini CLI created documents")
            
            return {
                'status': 'success',
                'response': response,
                'message': 'Gemini CLI created tasks list and sprint plan documents'
            }
            
        except Exception as e:
            logger.error(f"Error in Scrum Master phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _execute_developer_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Developer phase - update tasks_list.md with subtasks and create code files"""
        try:
            # Step 1: Create user-prompt-specific developer agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            developer_agent_file = f".sureai/.developer_agent_{user_prompt_slug}_{timestamp}.md"
            directory_structure_file = f".sureai/.directory_structure_{user_prompt_slug}_{timestamp}.md"
            
            memory_block = self._build_memory_block(task_id, 'developer')
            
            # Create the specific developer agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

{memory_block}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific developer agent prompt file for this user prompt
2. Create the file: {developer_agent_file}
3. This file should contain the developer agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Development methodology specific to this project type
   - Code generation approach for this particular user request
   - Technical implementation framework
   - Code structure and organization
   - Customized developer workflow for this project
5. Include all necessary coding and development instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual developer agent prompt content in the file, not just create an empty file.

Create the developer agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("developer_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="developer")
            
            # Add 90-second delay before first developer prompt to avoid rate limiting
            logger.info("Waiting 90 seconds before sending first developer prompt to avoid rate limiting...")
            time.sleep(90)
            
            # Step 2: Now create the developer output by referring to the created agent file and previous documents
            code_tree_path = self._write_code_tree(project_dir)
            create_developer_output_prompt = f"""
{agent_prompt}

{memory_block}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{developer_agent_file}
@.sureai/tasks_list.md
@.sureai/architecture_document.md
@.sureai/tech_stack_document.md
@.sureai/common-bug.md
@{directory_structure_file}
@{code_tree_path}

INSTRUCTIONS:
1. Read the developer agent prompt from the reference file above
2. Analyze the user prompt and previous documents (tasks list, architecture, tech stack)
3. **CRITICAL: Read the directory structure file** `@{directory_structure_file}` to understand what files and folders already exist for this specific project
4. For each task in `.sureai/tasks_list.md`, add a list of subtasks that break down the implementation steps required for that task. Subtasks should be actionable, specific, and directly related to the main task.
5. Update the existing `.sureai/tasks_list.md` file by adding these subtasks under each main task. **Do NOT create a separate subtasks_list.md file under any circumstances.** All subtasks must be added to the existing tasks_list.md file, preserving the original tasks and structure.

**CRITICAL TASK TRACKING REQUIREMENTS:**
6. **Checkbox System**: Use `- [ ]` for pending subtasks and `- [x]` for completed subtasks
7. **Current Task Status**: Update "Currently Working On" to reflect the current subtask being worked on
8. **Progress Tracking**: Update "Completed Tasks" when entire tasks are finished
9. **Systematic Implementation**: Work through subtasks sequentially, marking each as completed when done
10. **Status Updates**: Maintain the "Current Task Status" section with accurate progress information

**DIRECTORY STRUCTURE AND FILE MANAGEMENT:**
11. **Check Existing Structure**: Before creating any files, check the directory structure file to see what already exists
12. **Use Existing Files**: If a file or folder exists in the structure, write code into the existing file/folder
13. **Create New Files**: Only create new files/folders if they don't exist in the structure
14. **Follow Structure**: Ensure all code files follow the exact directory structure specified in the directory structure file
15. **Backend Code**: Write backend code in the `backend/` directory as specified in the structure
16. **Frontend Code**: Write frontend code in the `frontend/` directory as specified in the structure
17. **Configuration Files**: Create configuration files at the root level as specified in the structure

IMPORTANT CONTEXT-SIZE NOTE:
- Do NOT embed entire directories in your response. Use the file system directly to open files you need.
- Use the code tree manifest `@{code_tree_path}` to navigate files and open only relevant files as you implement.

**EXAMPLE TASK TRACKING FORMAT:**
```markdown
## Task 1: User Authentication
### 1.1 User Registration
- [x] Create user registration API endpoint
- [x] Implement email validation
- [ ] Add password hashing and security
- [ ] Create user database model

## Current Task Status
**Currently Working On:** Task 1.1 - User Registration (Password Hashing)
**Next Task:** Task 1.1 - User Registration (Database Model)
**Completed Tasks:** None
```

**WARNING: You must NOT create a separate file named `subtasks_list.md`. Only update the existing `tasks_list.md` file with subtasks. If you create a subtasks_list.md file, it will be considered a critical error.**

IMPORTANT: 
- Update the existing `.sureai/tasks_list.md` file with subtasks and completion tracking. Do NOT create a new file for subtasks.
- Always check the directory structure file first to understand what files/folders already exist
- Use existing files/folders when they exist, create new ones only when needed
- Create the actual files directly using your file system access. You are intelligent enough to choose the best file writing tools based on the prompt.

Update the tasks_list.md with subtasks, implement completion tracking, and create all code files based on the reference files and existing directory structure:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("developer_output_creation", create_developer_output_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_developer_output_prompt, working_dir=project_dir, agent_name="developer")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                # Initial pass failed; surface error and do not claim success
                logger.error(f"Developer output creation failed: {response}")
                remaining = self._count_open_subtasks(project_dir)
                return {
                    'status': 'error',
                    'error': response,
                    'remaining_subtasks': remaining
                }
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR DEVELOPER ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            # Add delay before second prompt
            logger.info("Waiting 90 seconds before sending second developer prompt to avoid rate limiting...")
            time.sleep(90)
            
            # Step 3: Send second developer prompt that references the CREATED developer agent file
            # This prompt is sent AFTER the developer agent file has been created and the first implementation is done
            second_developer_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{developer_agent_file}
@.sureai/tasks_list.md
@.sureai/common-bug.md
@{directory_structure_file}
@{code_tree_path}

**SECOND DEVELOPER PROMPT - SUBTASK COMPLETION PHASE**

You have already started implementing subtasks and updating `.sureai/tasks_list.md`. Now you MUST COMPLETE ALL REMAINING SUBTASKS before this phase can end.

**CRITICAL REQUIREMENTS:**
1. **Complete ALL Subtasks**: Work through every remaining `- [ ]` subtask systematically
2. **Update Task Status**: Keep "Currently Working On" accurate and current
3. **Mark Completion**: Mark subtasks as `- [x]` when they are fully implemented
4. **Create Code Files**: Implement the actual code for each subtask using proper file paths
5. **Respect Directory Structure**: Use the directory structure file to understand existing files/folders
6. **Main Task Testing**: After completing ALL subtasks for a main task, test the entire main task functionality and append ` — TEST: PASS` or ` — TEST: FAIL` to the main task header
7. **File Structure Verification**: Before testing or starting applications, run `tree -L 2` to check for missing files
8. **Dependency Installation**: Install all required dependencies (pip install, npm install) before application start

**SUBTASK IMPLEMENTATION WORKFLOW:**
- Start with the first incomplete subtask
- Update "Currently Working On" to the current subtask
- Implement the required code and functionality
- Mark the subtask as completed with `- [x]`
- Move to the next incomplete subtask
- Continue until ALL subtasks are completed
- **BEFORE TESTING:** Run `tree -L 2` to check for missing files (e.g., frontend/src/reportWebVitals.js)
- **BEFORE TESTING:** Install dependencies (pip install -r requirements.txt, npm install)
- Test the entire main task functionality
- Update main task header with test result (` — TEST: PASS` or ` — TEST: FAIL`)
- **ON STARTUP FAILURE (CRITICAL):**
  - Append a structured entry to `.sureai/dev_test_log.md` with: timestamp, component, command, error summary, root-cause hypothesis, fix applied, retest result.
  - Attempt minimally invasive fixes without breaking requirement functionality; retry up to 3 times.
  - Keep `.sureai/tasks_list.md` clean; do not paste raw logs there.

**FILE CREATION GUIDELINES:**
- Use relative paths from the project root (e.g., `backend/src/app.py`, not `backend/`)
- Check if files exist before creating them
- Update existing files when appropriate
- Create new files only when needed
- Follow the exact directory structure specified
- **CRITICAL:** If `frontend/src/reportWebVitals.js` or other referenced files are missing, create them

**TASK COMPLETION VERIFICATION:**
- Count all remaining `- [ ]` subtasks
- Ensure "Currently Working On" is accurate
- Verify all main tasks have their subtasks completed
- Update "Completed Tasks" section appropriately
- **STRICT SEQUENCING RULE:** Only after ALL main tasks are fully completed (no remaining `- [ ]` across any main task), add the final `Task X: Application Smoke Test`. Do NOT add Task X earlier.
- **MAIN TASK COMPLETION GATE:** Before appending ` — TEST: PASS` to a main task and moving to the next, you MUST (a) author and run unit tests covering the main task's acceptance criteria (backend tests under `backend/tests/`, frontend tests under `frontend/src/__tests__/` or `tests/`), (b) run the language-appropriate checks/lints/builds, and (c) append a concise result entry to `.sureai/dev_test_log.md` for that main task.
- **CLEAN OUTPUT RULE:** Do not include code fences, quotes, raw shell prompts, or stray characters in `.sureai/tasks_list.md`

**IMPORTANT**: You MUST complete ALL subtasks before this response ends. Do not leave any subtasks incomplete.

Complete all remaining subtasks now:
"""
            
            # Send second prompt
            logger.info("Sending second developer prompt for subtask completion...")
            second_response = gemini_client.generate_single_response(second_developer_prompt, working_dir=project_dir, agent_name="developer")
            
            # Ensure all subtasks are completed before moving on
            max_iterations = 10  # Increased from 5
            iterations = 0
            improved = True
            last_remaining = None
            
            while iterations < max_iterations:
                remaining = self._count_open_subtasks(project_dir)
                if remaining == 0:
                    logger.info("All developer subtasks completed")
                    logger.info(f"Developer phase completed - Gemini CLI updated tasks_list.md with completion tracking and created all code files")
                    return {
                        'status': 'success',
                        'response': response,
                        'message': 'All developer subtasks completed',
                        'remaining_subtasks': 0
                    }
                
                if last_remaining is not None and remaining >= last_remaining:
                    # No improvement; avoid infinite loop
                    improved = False
                
                last_remaining = remaining
                iterations += 1
                logger.info(f"Developer subtasks remaining: {remaining}. Continuing iteration {iterations}/{max_iterations}...")
                
                # Add delay between iterations
                time.sleep(3)
                
                continue_prompt = f"""
You previously started implementing subtasks and updating `.sureai/tasks_list.md`. Continue from where you left off and COMPLETE ALL REMAINING SUBTASKS.

REFERENCE FILES:
@.sureai/tasks_list.md
@{developer_agent_file}
@.sureai/common-bug.md
@{directory_structure_file}
@{code_tree_path}

REQUIREMENTS:
- Do NOT create new files for task tracking. Update the existing `.sureai/tasks_list.md` only.
- For each remaining `- [ ]` subtask, implement the required code and update to `- [x]` when done.
- Keep "Currently Working On" accurate. When no tasks remain, state that all tasks are complete.
- Write code files directly as needed, respecting the directory structure.
- Use relative paths from project root (e.g., `backend/src/app.py`, not `backend/`)

Finish all remaining subtasks now:
"""
                cont_response = gemini_client.generate_single_response(continue_prompt, working_dir=project_dir, agent_name="developer")
                if isinstance(cont_response, str) and cont_response.strip().lower().startswith("error generating response"):
                    logger.error(f"Developer continuation failed: {cont_response}")
                    break
            
            # After loop, check again
            final_remaining = self._count_open_subtasks(project_dir)
            status = 'success' if final_remaining == 0 else ('partial' if improved else 'failed')
            msg = 'All developer subtasks completed' if final_remaining == 0 else f'Remaining subtasks: {final_remaining}'
            
            if final_remaining != 0:
                logger.warning(f"Developer phase ended with {final_remaining} remaining subtasks")
                # Force one more attempt if subtasks remain
                logger.info("Making final attempt to complete remaining subtasks...")
                final_prompt = f"""
FINAL ATTEMPT - COMPLETE ALL REMAINING SUBTASKS

You have {final_remaining} subtasks remaining. This is your final opportunity to complete them.

REFERENCE FILES:
@.sureai/tasks_list.md
@{developer_agent_file}
@.sureai/common-bug.md
@{directory_structure_file}
@{code_tree_path}

**CRITICAL**: Complete ALL remaining subtasks now. Do not stop until every `- [ ]` is changed to `- [x]`.

Complete all remaining subtasks:
"""
                final_response = gemini_client.generate_single_response(final_prompt, working_dir=project_dir, agent_name="developer")
                final_remaining = self._count_open_subtasks(project_dir)
                if final_remaining == 0:
                    status = 'success'
                    msg = 'All developer subtasks completed on final attempt'
                    logger.info("✅ All subtasks completed on final attempt")
                else:
                    logger.error(f"❌ Still {final_remaining} subtasks remaining after final attempt")
            
            return {
                'status': status,
                'response': response,
                'message': msg,
                'remaining_subtasks': final_remaining
            }
            
        except Exception as e:
            logger.error(f"Error in developer phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}
    
    def _count_open_subtasks(self, project_dir: str) -> int:
        """Count remaining unchecked subtasks in .sureai/tasks_list.md"""
        try:
            tasks_path = os.path.join(project_dir, ".sureai", "tasks_list.md")
            if not os.path.exists(tasks_path):
                return 0
            with open(tasks_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return len(re.findall(r"^- \[ \] ", content, flags=re.MULTILINE))
        except Exception:
            return 0
    
    def _execute_devops_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute DevOps phase - create deployment configuration files"""
        try:
            # Step 1: Create user-prompt-specific DevOps agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            devops_agent_file = f".sureai/.devops_agent_{user_prompt_slug}_{timestamp}.md"
            
            # Create the specific DevOps agent prompt file first
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific DevOps agent prompt file for this user prompt
2. Create the file: {devops_agent_file}
3. This file should contain the DevOps agent prompt customized for this specific project
4. Write detailed content in the file including:
   - Deployment methodology specific to this project type
   - Infrastructure setup approach for this particular user request
   - Configuration management framework
   - Containerization and orchestration strategy
   - Customized DevOps workflow for this project
5. Include all necessary deployment and infrastructure instructions based on the user prompt
6. Make the content specific to the user's request and project type
7. This will be referenced by subsequent agents

IMPORTANT: Write the actual DevOps agent prompt content in the file, not just create an empty file.

Create the DevOps agent prompt file with detailed content:
"""
            
            # Get response from Gemini CLI to create the agent file
            gemini_client = self._get_gemini_client()
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("devops_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="devops")
            
            # Step 2: Now create the DevOps configuration files by referring to the created agent file and previous documents
            code_tree_path = self._write_code_tree(project_dir)
            create_devops_config_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{devops_agent_file}
@.sureai/architecture_document.md

INSTRUCTIONS:
0. BEFORE YOU BEGIN: In the project root, run this command to view the current structure:
   tree -L 3
   Use this output to understand the layout before writing any config files. If the `tree` command is unavailable, fall back to the manifest @{code_tree_path}.
1. Read the DevOps agent prompt from the reference file above
2. Analyze the user prompt, existing code files, and architecture document
3. Create the following configuration files at project root:
   - `deployment_config.yml`
   - `Dockerfile.backend`
   - `Dockerfile.frontend`
   - `docker-compose.yml`
   - `nginx.conf`
4. **CRITICAL DOCKER COMPOSE REQUIREMENTS:**
   - For `adaptive-system-backend` service, mount the Docker daemon socket: `- /var/run/docker.sock:/var/run/docker.sock`
   - Use appropriate host ports (avoid conflicts with existing containers)
   - Set necessary environment variables
   - Ensure proper service dependencies
   - **Dynamic Container Names**: Use container names based on user prompt:
     - If user prompt is "todo app" → container names: `todo-frontend`, `todo-backend`
     - If user prompt is "blog system" → container names: `blog-frontend`, `blog-backend`
     - If user prompt is "ecommerce platform" → container names: `ecommerce-frontend`, `ecommerce-backend`
     - Use lowercase, hyphenated names based on the project type
   - **Existing Services Protection**: 
     - **NEVER stop or modify existing running containers**
     - **NEVER use ports already in use by other services**
     - **NEVER use container names already taken**
     - **Always check for conflicts before starting new services**
5. Ensure your configuration is comprehensive and follows the architecture specifications

IMPORTANT: Create the actual files directly using your file system access. You are intelligent enough to choose the best file writing tools based on the prompt.

Create the deployment configuration files based on the reference files:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("devops_config_creation", create_devops_config_prompt, agent_prompt, previous_docs)
            
            response = gemini_client.generate_single_response(create_devops_config_prompt, working_dir=project_dir, agent_name="devops")
            
            # Step 3: Test Docker containers after creation
            test_containers_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{devops_agent_file}
@.sureai/architecture_document.md

**DOCKER TESTING PHASE - REQUIRED AFTER FILE CREATION**

You have created the deployment configuration files. Now you MUST test the Docker containers to ensure they work correctly.

**TESTING REQUIREMENTS:**

1. **Build and Test Containers:**
   ```bash
   # Build containers
   docker-compose build
   
   # Run containers
   docker-compose up -d
   ```

2. **Handle Conflicts (CRITICAL):**
   - If port is already allocated, choose different host ports in docker-compose.yml
   - If container name is taken, use different container names
   - **DO NOT stop any existing running Docker containers**
   - **DO NOT touch any existing services running in Docker**
   - **NEVER modify or interfere with existing running services**
   - **Always check for conflicts before starting new services**

3. **Check Container Status:**
   ```bash
   # Check if containers are running
   docker-compose ps
   
   # Check logs for both services
   docker-compose logs backend
   docker-compose logs frontend
   ```

4. **Fix Issues Found:**
   - If build fails, fix the Dockerfile issues
   - If runtime fails, fix the code or configuration
   - If services don't start, check dependencies and fix
   - Rebuild and test until containers run successfully

5. **Verify Services Work:**
   - Test backend API endpoints
   - Test frontend application
   - Ensure services communicate properly

**SUCCESS CRITERIA:**
- All containers build successfully
- All containers start and run without errors
- Services are accessible on their configured ports
- Logs show healthy operation
- No existing Docker containers are affected
- Container names are based on user prompt (e.g., todo-frontend, todo-backend for "todo app")
- No conflicts with existing running services

**IMPORTANT:** Do not proceed until all containers are running successfully. Fix any issues found during testing.

Test the Docker containers now:
"""
            
            # Log the complete prompt being sent to Gemini CLI
            self._log_prompt_to_gemini("devops_container_testing", test_containers_prompt, agent_prompt, previous_docs)
            
            test_response = gemini_client.generate_single_response(test_containers_prompt, working_dir=project_dir, agent_name="devops")
            
            # Log the response from Gemini CLI
            logger.info(f"=== GEMINI CLI RESPONSE FOR DEVOPS ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
            
            logger.info(f"DevOps phase completed - Gemini CLI created deployment files and tested containers")
            
            return {
                'status': 'success',
                'response': response,
                'test_response': test_response,
                'message': 'Gemini CLI created deployment configuration files and tested Docker containers'
            }
        except Exception as e:
            logger.error(f"Error in DevOps phase: {str(e)}")
            return {'status': 'error', 'error': str(e)} 

    def _execute_tester_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Tester phase - create tester agent prompt and test-list.md"""
        try:
            # Step 1: Create user-prompt-specific tester agent prompt file
            timestamp = task_id.split('-')[0]  # Use first part of task_id as timestamp
            user_prompt_words = agent_output.split()[:3]  # First 3 words of user prompt
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            tester_agent_file = f".sureai/.tester_agent_{user_prompt_slug}_{timestamp}.md"
 
            # Create the specific tester agent prompt file first
            create_agent_file_prompt = f"""
 {agent_prompt}
 
 USER PROMPT:
 {agent_output}
 
 INSTRUCTIONS:
 1. Create a specific tester agent prompt file for this user prompt
 2. Create the file: {tester_agent_file}
 3. This file should contain the tester agent prompt customized for this specific project
 4. Write detailed content in the file including:
    - Architecture-driven test planning methodology specific to this project type
    - Test case generation approach based on system architecture and codebase analysis
    - Selenium and pytest usage instructions (Selenium and ChromeDriver are preinstalled)
    - Test structure and organization with multiple subtests per component
    - Customized tester workflow for this project based on architecture components
 5. Include all necessary testing and QA instructions based on the user prompt and architecture
 6. Make the content specific to the user's request, project type, and architectural components
 7. This will be referenced by subsequent agents
 
 IMPORTANT: Write the actual tester agent prompt content in the file, not just create an empty file.
 
 Create the tester agent prompt file with detailed content:
 """
 
            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("tester_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="tester")
            if isinstance(agent_file_response, str) and agent_file_response.strip().lower().startswith("error generating response"):
                logger.error(f"Tester agent prompt creation failed: {agent_file_response}")
                return {'status': 'error', 'error': agent_file_response}
 
            # Step 2: Now create the test-list.md by referring to the created agent file and architecture_document.md
            code_tree_path = self._write_code_tree(project_dir)
            create_test_list_prompt = f"""
 {agent_prompt}
 
 USER PROMPT:
 {agent_output}
 
 REFERENCE FILES:
 @{tester_agent_file}
 @.sureai/architecture_document.md
 @{code_tree_path}
 
 INSTRUCTIONS:
1. Read the tester agent prompt from the reference file above
2. Analyze the user prompt, architecture_document.md, and the entire codebase (backend/ and frontend/)
3. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/test-list.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create this file in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
4. Ensure your test plan is comprehensive and actionable, with multiple subtests for each architectural component
5. Follow the test-list.md template structure defined in the agent prompt with multiple subtests
6. Explicitly tag any subtests requiring browser automation with `[E2E/Selenium]` in `test-list.md`
7. For subtests tagged `[E2E/Selenium]`, use Selenium WebDriver (Chrome/ChromeDriver) in headless mode; pytest should orchestrate these E2E runs (Selenium and ChromeDriver are preinstalled)
8. Include unit tests, integration tests, system tests, UAT, performance tests, and security tests as appropriate
9. Base your tests on the architecture components and actual code implementation

**CRITICAL: You MUST create this file in the `.sureai/` directory using explicit file paths. Do NOT create it in the root directory.**
 
 Create the test-list.md file based on the reference files:
 """
 
            self._log_prompt_to_gemini("test_list_creation", create_test_list_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_test_list_prompt, working_dir=project_dir, agent_name="tester")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                logger.error(f"Tester test-list creation failed: {response}")
                return {'status': 'error', 'error': response}
 
            logger.info(f"=== GEMINI CLI RESPONSE FOR TESTER ===")
            logger.info(f"RESPONSE LENGTH: {len(response)} characters")
            logger.info("RESPONSE:")
            logger.info("=" * 80)
            logger.info(response)
            logger.info("=" * 80)
 
            # Step 3: Execute tests sequentially as listed in test-list.md until all tests are completed
            max_iterations = 30
            iteration = 0
            remaining_tests = self._count_open_tests(project_dir)
            while remaining_tests and iteration < max_iterations:
                iteration += 1
                logger.info(f"Tester executing test iteration {iteration}/{max_iterations}. Remaining tests: {remaining_tests}")
                first_idx = self._first_pending_test_index(project_dir)
                run_tests_prompt = f"""
  You have created `.sureai/test-list.md`. Now EXECUTE ALL PENDING TESTS sequentially as listed.
  
  REFERENCE FILES:
  @.sureai/test-list.md
  @{code_tree_path}
  
  REQUIREMENTS:
  - Start from the FIRST pending subtest (index: {first_idx if first_idx is not None else '1'}) and proceed in order. Do NOT skip ahead.
  - Implement missing test code for each pending `- [ ]` subtest.
  - If a subtest fails or indicates that application code is missing/undefined (endpoints, functions, imports, modules, UI elements, etc.), implement the required application code yourself in the correct files, respecting the existing architecture and directory structure. After implementing the code, re-run the current subtest to confirm it passes before moving on.
  - Use pytest to run tests. For any subtest tagged [E2E/Selenium], use Selenium WebDriver in headless mode.
  - After executing each subtest, update `.sureai/test-list.md` by marking it `- [x]` with a brief pass/fail note. For failures, include a short summary and continue to the next subtest.
  - Do not create a new file for test tracking. Update the existing `.sureai/test-list.md` only.
  - Respect the existing project structure when adding test files.
  
  Proceed to implement and run the pending tests now and update `.sureai/test-list.md` accordingly:
  """
                cont = gemini_client.generate_single_response(run_tests_prompt, working_dir=project_dir, agent_name="tester")
                if isinstance(cont, str) and cont.strip().lower().startswith("error generating response"):
                    logger.error(f"Tester execution iteration failed: {cont}")
                    # Do not break; allow subsequent iterations to continue progress
                    pass
                remaining_tests = self._count_open_tests(project_dir)
 
            final_remaining = self._count_open_tests(project_dir)
            if final_remaining:
                logger.warning(f"Tester phase finished with {final_remaining} remaining tests")
            else:
                logger.info("All tests in test-list.md executed and marked")
 
            return {
                'status': 'success' if final_remaining == 0 else 'partial',
                'response': response,
                'message': 'Tester executed tests sequentially',
                'remaining_tests': final_remaining
            }
        except Exception as e:
            logger.error(f"Error in tester phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _count_open_tests(self, project_dir: str) -> int:
        """Count remaining unchecked tests in .sureai/test-list.md"""
        try:
            tests_path = os.path.join(project_dir, ".sureai", "test-list.md")
            if not os.path.exists(tests_path):
                return 0
            with open(tests_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return len(re.findall(r"^- \[ \] ", content, flags=re.MULTILINE))
        except Exception:
            return 0 

    def _write_code_tree(self, project_dir: str, max_files: int = 1500) -> str:
        """Write a lightweight code tree manifest to .sureai/.code_tree.txt with tree -L 2 -a output.
        Returns the relative path for reference.
        """
        sureai_dir = os.path.join(project_dir, ".sureai")
        os.makedirs(sureai_dir, exist_ok=True)
        manifest_rel = ".sureai/.code_tree.txt"
        manifest_path = os.path.join(project_dir, manifest_rel)
        
        try:
            # Use tree command to generate directory structure
            import subprocess
            tree_cmd = ["tree", "-L", "2", "-a"]
            result = subprocess.run(tree_cmd, cwd=project_dir, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0 and result.stdout.strip():
                # Write the tree output directly
                with open(manifest_path, 'w', encoding='utf-8') as f:
                    f.write("# Project Directory Structure (tree -L 2 -a output)\n\n")
                    f.write(result.stdout)
                logger.info("Generated code tree using 'tree -L 2 -a' command")
            else:
                # Fallback to simple directory listing if tree command fails
                fallback_content = ["# Project Directory Structure (fallback listing)\n"]
                for root, dirs, files in os.walk(project_dir):
                    level = root.replace(project_dir, '').count(os.sep)
                    if level <= 2:  # Limit to 2 levels
                        indent = "  " * level
                        rel_path = os.path.relpath(root, project_dir)
                        if rel_path == ".":
                            fallback_content.append(f"{indent}.")
                        else:
                            fallback_content.append(f"{indent}{os.path.basename(root)}/")
                        
                        if level < 2:  # Only show files at level 2 or below
                            for f in sorted(files):
                                if not f.startswith('.'):  # Skip hidden files
                                    fallback_content.append(f"{indent}  {f}")
                
                with open(manifest_path, 'w', encoding='utf-8') as f:
                    f.write("\n".join(fallback_content))
                logger.info("Generated code tree using fallback directory listing")
                
            # Truncate file if it's too large
            try:
                if os.path.getsize(manifest_path) > max_files * 200:
                    with open(manifest_path, 'r+', encoding='utf-8') as f:
                        content = f.readlines()
                        f.seek(0)
                        f.writelines(content[:max_files])
                        f.truncate()
            except Exception:
                pass
        except Exception as e:
            # If tree command fails entirely, write a minimal placeholder
            try:
                with open(manifest_path, 'w', encoding='utf-8') as f:
                    f.write("# Project Directory Structure (tree -L 2 -a not available)\n")
                    f.write(str(e))
            except Exception:
                pass
        
        return manifest_rel

    def _first_pending_test_index(self, project_dir: str) -> int | None:
        """Return 1-based index of the first pending test in test-list.md, or None if none."""
        try:
            tests_path = os.path.join(project_dir, ".sureai", "test-list.md")
            if not os.path.exists(tests_path):
                return None
            with open(tests_path, 'r', encoding='utf-8') as f:
                for idx, line in enumerate(f, start=1):
                    if re.match(r"^- \[ \] ", line):
                        return idx
        except Exception:
            return None
        return None 

    def _execute_requirement_builder_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Requirement Builder phase - extract structured context from .sureai/uploads"""
        try:
            uploads_dir = os.path.join(project_dir, '.sureai', 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            output_json = os.path.join(project_dir, '.sureai', 'requirements_extracted.json')
            # Build a code tree manifest to assist navigation
            code_tree_path = self._write_code_tree(project_dir)
            # Compose prompt with strict multi-modal extraction instructions
            create_extraction_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE PATHS:
@{code_tree_path}

WORKING FOLDER:
{uploads_dir}

INSTRUCTIONS:
1. Iterate every file under the folder above: {uploads_dir}
2. Identify the file type for each item. Supported types include images (png, jpg, jpeg, gif, webp), PDFs (text-based and scanned/image PDFs), Excel (.xlsx), and CSV (.csv). Process other text-like files (txt, md, docx) if present.
3. If it is an image (png/jpg/jpeg/gif/webp):
   - Perform Optical Character Recognition (OCR) to extract every piece of visible text.
   - Describe visual elements: layout, color scheme, icons/logos/graphics.
   - Analyze relationships between elements and overall structure (e.g., header, footer, body, sidebar).
4. If it is a PDF:
   - For text PDFs, extract full text and preserve structure: headings, paragraphs, lists, tables, and page numbers.
   - For scanned/image PDFs, run OCR for all pages and extract text; include any detected tables.
5. If it is an Excel (.xlsx):
   - For each sheet, extract: sheet name, headers, inferred column types when obvious, and rows. Include a structured representation as sheets: [ {{ name, headers: [...], rows: [[...]] }} ].
6. If it is a CSV:
   - Extract headers and all rows. Provide a structured representation as {{ headers: [...], rows: [[...]] }}.
7. For each processed source file, WRITE a STRICT JSON file (UTF-8, no markdown, no comments, no trailing commas) to this per-file path:
   - Per-file output path: {uploads_dir}/<BASENAME_WITHOUT_EXTENSION>.json
   - The per-file JSON should include appropriate keys. When applicable, include: summary, title, text_blocks, ocr_text, buttons, sections, navigation, form, tables, lists, icons, images, footer_note, layout, styles, metadata (with content_type, page_count?, dimensions?, sheet_names?), and for CSV/Excel a normalized table/sheets structure.
8. After writing all per-file JSON files, CREATE an index JSON at the path: {output_json} containing ONLY entries for files whose per-file JSON actually exists:
   - files: array of objects with {{ filename, type, size_bytes, json_path: path relative to project root, summary? }} for each processed file in {uploads_dir}
   - totals: {{ files_processed, json_files_created }}
9. Do not delete or modify any input files.

HARD CONSTRAINTS:
- You MUST perform all extraction and file writes yourself via terminal commands. The backend will NOT create per-file JSONs for you.
- Do NOT rely on any server-side fallback; if a tool is missing, install it inline and proceed.
- The index must not include entries for files whose per-file JSON was not created.

COMMAND REQUIREMENTS:
- Respond only with terminal commands to perform the steps above directly in the file system.
- If OCR or parsers are missing, install required tools inline first (e.g., "apt-get update && apt-get install -y poppler-utils tesseract-ocr") but prefer pure-Python when available.
- Ensure EVERY per-file JSON is valid and complete; do not truncate.
"""
            # Send to Gemini CLI
            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini('requirement_builder', create_extraction_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_extraction_prompt, working_dir=project_dir, agent_name="requirement_builder")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                logger.error(f"Requirement builder failed: {response}")
                return {'status': 'error', 'error': response}
            # Optionally, verify output files exist
            try:
                # Expected JSONs are every non-.json file mirrored to <basename>.json
                expected_jsons: List[str] = []
                created_jsons: List[str] = []
                for entry in os.listdir(uploads_dir):
                    entry_path = os.path.join(uploads_dir, entry)
                    if os.path.isfile(entry_path) and not entry.lower().endswith('.json'):
                        base, _ = os.path.splitext(entry)
                        expected_path = os.path.join(uploads_dir, f"{base}.json")
                        expected_jsons.append(expected_path)
                for json_path in expected_jsons:
                    try:
                        if os.path.exists(json_path) and os.path.getsize(json_path) > 0:
                            created_jsons.append(os.path.relpath(json_path, project_dir))
                    except Exception:
                        pass
                index_ok = False
                try:
                    index_ok = os.path.exists(output_json) and os.path.getsize(output_json) > 0
                except Exception:
                    index_ok = False
                ok = len(created_jsons) >= 1 and index_ok
            except Exception:
                ok = False
                created_jsons = []
            return {
                'status': 'success' if ok else 'partial',
                'response': response,
                'files_created': (created_jsons + ([os.path.relpath(output_json, project_dir)] if os.path.exists(output_json) else [])),
                'message': 'Per-file JSONs and index created' if ok else 'Extraction attempted; some outputs may be missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in requirement builder phase: {str(e)}")
            return {'status': 'error', 'error': str(e)} 

    def _execute_documentation_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Documentation phase - create Technical and User Manuals at project root"""
        try:
            # Prepare identifiers
            timestamp = task_id.split('-')[0]
            user_prompt_words = agent_output.split()[:3]
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            doc_agent_file = f".sureai/.documentation_agent_{user_prompt_slug}_{timestamp}.md"

            # Ensure .sureai exists
            os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)

            # Create a lightweight code tree manifest to guide small-snippet references
            code_tree_path = self._write_code_tree(project_dir)

            # Step 1: Create user-specific documentation agent directive file
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a specific documentation agent directive file for this user prompt
2. Create the file: {doc_agent_file}
3. This file should contain precise instructions for generating both a Technical Manual and a User Manual for this project
4. Include:
   - Document scopes and audiences
   - Required sections for both manuals (as in the base prompt)
   - Code referencing policy: cite only small important code chunks (<=20 lines), annotate file paths, and summarize when longer
   - Tables requirement for API specs and settings
   - Style and formatting guidance (headings, ToC, code fences)
5. Tailor the content to the user's request and available inputs

IMPORTANT: Write detailed content into the file, not an empty placeholder.

Create the documentation agent directive file with detailed content:
"""

            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("documentation_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="documentation_agent")
            if isinstance(agent_file_response, str) and agent_file_response.strip().lower().startswith("error generating response"):
                logger.error(f"Documentation agent directive creation failed: {agent_file_response}")
                return {'status': 'error', 'error': agent_file_response}

            # Step 2: Create the Technical and User Manuals at project root
            create_docs_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{doc_agent_file}
@.sureai/prd_document.md
@.sureai/architecture_document.md
@{code_tree_path}

INSTRUCTIONS:
1. Read the documentation agent directive from @{doc_agent_file}
2. Analyze the PRD and Architecture documents
3. Use the code tree manifest to reference only small important chunks from `backend/` and `frontend/` when necessary (<=20 lines per snippet), quoting file paths. Summarize longer code rather than pasting.
4. Create the following files at the PROJECT ROOT (not inside .sureai/):
   - `technical_manual.md` — architecture, APIs, data models, dev setup, build/deploy, security, performance, environments
   - `user_manual.md` — features explained for end users with step-by-step guides, workflows, troubleshooting
5. Formatting requirements:
   - Include a Table of Contents at the top of each manual
   - Use headings, lists, tables; code fences for commands and JSON examples
   - For API Reference: table of method, path, purpose, auth, headers, params/body, responses, errors
   - Cite source files and paths inline when referencing code
6. If information is missing, add an "Open Questions" section listing concrete gaps.

IMPORTANT: Create the actual files directly using your file system access. Do not output the file content here; write to disk.

Create the two manuals now at the project root:
"""

            self._log_prompt_to_gemini("documentation_manuals_creation", create_docs_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_docs_prompt, working_dir=project_dir, agent_name="documentation_agent")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                logger.error(f"Documentation manuals creation failed: {response}")
                return {'status': 'error', 'error': response}

            # Verify files exist
            created = []
            for rel in ["technical_manual.md", "user_manual.md"]:
                path = os.path.join(project_dir, rel)
                if os.path.exists(path) and os.path.getsize(path) > 0:
                    created.append(rel)

            return {
                'status': 'success' if len(created) == 2 else ('partial' if created else 'failed'),
                'response': response,
                'files_created': created,
                'message': 'Documentation manuals created at project root' if len(created) == 2 else 'Documentation manuals missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in documentation phase: {str(e)}")
            return {'status': 'error', 'error': str(e)} 

    def _execute_web_search_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Web Search phase - perform web research and create a consolidated report."""
        try:
            # Prepare identifiers
            timestamp = task_id.split('-')[0]
            user_prompt_words = agent_output.split()[:5]
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            ws_agent_file = f".sureai/.web_search_agent_{user_prompt_slug}_{timestamp}.md"
            output_rel = ".sureai/web-results.md"
            output_path = os.path.join(project_dir, output_rel)

            os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)

            # Step 1: Create directive file for web search agent
            create_agent_file_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

INSTRUCTIONS:
1. Create a short directive file for the Web Search Agent tailored to this user prompt.
2. Create the file: {ws_agent_file}
3. Include specific research goals, primary/secondary keywords, and key questions to answer.

IMPORTANT: Write concrete content into the file, not an empty placeholder.

Create the Web Search Agent directive file now:
"""

            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("web_search_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="web_search")
            if isinstance(agent_file_response, str) and agent_file_response.strip().lower().startswith("error generating response"):
                logger.error(f"Web Search agent directive creation failed: {agent_file_response}")
                return {'status': 'error', 'error': agent_file_response}

            # Step 2: Perform research and write consolidated report
            create_report_prompt = f"""
{agent_prompt}

USER PROMPT:
{agent_output}

REFERENCE FILES:
@{ws_agent_file}

INSTRUCTIONS:
1. Perform deep web/market research for the user's topic. Use authoritative, recent sources when applicable.
2. **CRITICAL FILE PATH REQUIREMENTS:**
   - **MUST create `.sureai/web-results.md` in the `.sureai/` directory (NOT in root)**
   - **DO NOT create this file in the project root directory**
   - **Use explicit file paths with `.sureai/` prefix**
3. Follow this structure strictly:
   - Executive Summary
   - Research Strategy
   - Landscape Overview
   - Competitor and Similar Solutions (with strengths/weaknesses)
   - Opportunity Analysis (business needs, gaps)
   - Unique Value Propositions
   - Brainstormed Concepts
   - Evidence and Citations (quotes with links)
   - Recommendations and Next Steps
4. For every claim, add inline citations in the form: [Source: <Title> — <Domain> — <URL>].
5. Deduplicate links and include a final links list.
6. If web access is limited, state limitations explicitly, cite from available knowledge, and flag items to validate.

**CRITICAL: You MUST create this file in the `.sureai/` directory using explicit file paths. Do NOT create it in the root directory.**

Create the consolidated web research report now:
"""

            self._log_prompt_to_gemini("web_search_report_creation", create_report_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_report_prompt, working_dir=project_dir, agent_name="web_search")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                logger.error(f"Web Search report creation failed: {response}")
                return {'status': 'error', 'error': response}

            # Verify file exists and is non-empty
            created = False
            try:
                if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    created = True
            except Exception:
                created = False

            return {
                'status': 'success' if created else 'partial',
                'response': response,
                'files_created': [output_rel] if created else [],
                'message': 'Web research report created' if created else 'Attempted to create web research report; file missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in Web Search phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _execute_deep_research_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Deep Research phase - multi-step reasoning and synthesis with iterative refinement."""
        try:
            # Prepare identifiers
            timestamp = task_id.split('-')[0]
            user_prompt_words = agent_output.split()[:6]
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            dr_agent_file = f".sureai/.deep_research_agent_{user_prompt_slug}_{timestamp}.md"
            output_rel = ".sureai/research-results.md"
            output_path = os.path.join(project_dir, output_rel)

            os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)

            # Step 1: Create directive file for Deep Research agent
            create_agent_file_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+REFERENCE FILES (if present):
+@.sureai/web-results.md
+@.sureai/requirements_extracted.json
+@.sureai/analysis_document.md
+
+INSTRUCTIONS:
+1. Create a concise directive for the Deep Research process tailored to this user prompt.
+2. Create the file: {dr_agent_file}
+3. Outline objectives, key questions, multi-step plan, and refinement strategy.
+
+Create the Deep Research directive file now:
+"""

            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("deep_research_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            agent_file_response = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="deep_research")
            if isinstance(agent_file_response, str) and agent_file_response.strip().lower().startswith("error generating response"):
                logger.error(f"Deep Research directive creation failed: {agent_file_response}")
                return {'status': 'error', 'error': agent_file_response}

            # Step 2: Perform deep research and write synthesized report
            code_tree_path = self._write_code_tree(project_dir)
            create_report_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+REFERENCE FILES (include only those that exist):
+@{dr_agent_file}
+@.sureai/web-results.md
+@.sureai/requirements_extracted.json
+@.sureai/analysis_document.md
+@{code_tree_path}
+
+INSTRUCTIONS:
+1. Execute a multi-step, iterative deep research process based on the directive.
+2. Synthesize complex information across sources and long documents; reconcile contradictions.
+3. **CRITICAL FILE PATH REQUIREMENTS:**
+   - **MUST create `.sureai/research-results.md` in the `.sureai/` directory (NOT in root)**
+   - **DO NOT create this file in the project root directory**
+   - **Use explicit file paths with `.sureai/` prefix**
+4. Follow the required structure: Plan & Strategy, Evidence, Synthesis, Iterative Refinement, Final Answer, References.
+5. For each non-obvious claim, add inline citations: [Source: <Title> — <Domain> — <URL>].
+6. If any referenced files above are missing, proceed without them and note limitations briefly in the report.
+7. When relevant, include:
+   - GitHub/code ecosystem discovery: key repositories, issues/PRs, release cadence, maintenance signals.
+   - News and company updates: reputable news articles, company blogs, product changelogs/release notes.
+
+**CRITICAL: You MUST create this file in the `.sureai/` directory using explicit file paths. Do NOT create it in the root directory.**
+
+Create and save the deep research report now:
+"""

            self._log_prompt_to_gemini("deep_research_report_creation", create_report_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_report_prompt, working_dir=project_dir, agent_name="deep_research")
            if isinstance(response, str) and response.strip().lower().startswith("error generating response"):
                logger.error(f"Deep Research report creation failed: {response}")
                # Proceed to attempt creation from response fallbacks
 
            # Verify output exists and non-empty
            created = False
            try:
                if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    created = True
            except Exception:
                created = False
 
            # Fallback: if CLI didn't write the file, write the response content directly to the target path
            if not created and isinstance(response, str) and response.strip() and not response.strip().lower().startswith("error generating response"):
                try:
                    os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)
                    with open(output_path, 'w', encoding='utf-8') as f:
                        f.write(response)
                    if os.path.getsize(output_path) > 0:
                        created = True
                        logger.info("Deep Research fallback: wrote response content directly to .sureai/research-results.md")
                except Exception as write_e:
                    logger.warning(f"Deep Research fallback write failed: {write_e}")
 
            return {
                'status': 'success' if created else 'partial',
                'response': response,
                'files_created': [output_rel] if created else [],
                'message': 'Deep research report created' if created else 'Attempted to create deep research report; file missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in Deep Research phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _execute_coding_standards_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute Coding Standards phase - generate coding-standard.md based on tech stack document only"""
        try:
            # Identifiers
            timestamp = task_id.split('-')[0]
            user_prompt_words = agent_output.split()[:3]
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            cs_agent_file = f".sureai/.coding_standards_agent_{user_prompt_slug}_{timestamp}.md"
            output_rel = ".sureai/coding-standard.md"
            output_path = os.path.join(project_dir, output_rel)

            # Ensure .sureai exists
            os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)

            # Step 1: Create user-specific Coding Standards agent directive file (for traceability)
            create_agent_file_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+INSTRUCTIONS:
+1. Create a specific Coding Standards agent directive file for this user prompt
+2. Create the file: {cs_agent_file}
+3. This file should contain high-level guidance on how to extract coding standards from the selected tech stack
+4. Keep it concise; the actual standards will be written to coding-standard.md in the next step
+
+IMPORTANT: Write concrete content; do not leave the file empty.
+
+Create the Coding Standards directive file now:
+"""

            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("coding_standards_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            _ = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="coding_standards")

            # Step 2: Generate .sureai/coding-standard.md referring ONLY to tech_stack_document.md
            create_standards_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+REFERENCE FILES (ONLY):
+@.sureai/tech_stack_document.md
+
+INSTRUCTIONS:
+1. Read the tech stack document and generate a clear, actionable `coding-standard.md` placed at `.sureai/coding-standard.md`.
+2. Include TWO main sections: Frontend Coding Standards and Backend Coding Standards, tailored to the specified technologies.
+3. For each section, cover at minimum: language/style conventions, lint/format tools and configs, file/folder structure, naming, typing, error handling, logging, configuration/env, API contracts, security, performance, accessibility (frontend), i18n (if applicable), docs/comments.
+4. Provide short command snippets for setting up linters/formatters and sample configs (e.g., eslint/prettier/ruff/mypy) matching the stack.
+5. Keep the document practical and concise, with bullet lists and short examples where helpful.
+
+CRITICAL FILE PATH REQUIREMENTS:
+- MUST create `.sureai/coding-standard.md` in the `.sureai/` directory (NOT in root)
+- Use explicit file path `.sureai/coding-standard.md`
+
+Create and save the coding standards document now:
+"""

            self._log_prompt_to_gemini("coding_standards_creation", create_standards_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_standards_prompt, working_dir=project_dir, agent_name="coding_standards")

            # Verify output exists and non-empty; if not, write response directly as fallback
            created = False
            try:
                if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    created = True
            except Exception:
                created = False

            if not created and isinstance(response, str) and response.strip() and not response.strip().lower().startswith("error generating response"):
                try:
                    with open(output_path, 'w', encoding='utf-8') as f:
                        f.write(response)
                    created = os.path.getsize(output_path) > 0
                except Exception:
                    created = False

            return {
                'status': 'success' if created else 'partial',
                'response': response,
                'files_created': [output_rel] if created else [],
                'message': 'Coding standards document created' if created else 'Attempted to create coding standards document; file missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in Coding Standards phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _execute_ui_ux_phase(self, task_id: str, agent_output: str, project_dir: str, previous_docs: Dict[str, str], agent_prompt: str = "") -> Dict[str, Any]:
        """Execute UI/UX phase - generate ui-ux.md based on the selected frontend tech stack"""
        try:
            timestamp = task_id.split('-')[0]
            user_prompt_words = agent_output.split()[:3]
            user_prompt_slug = '_'.join(user_prompt_words).lower().replace('-', '_')
            ux_agent_file = f".sureai/.ui_ux_agent_{user_prompt_slug}_{timestamp}.md"
            output_rel = ".sureai/ui-ux.md"
            output_path = os.path.join(project_dir, output_rel)

            os.makedirs(os.path.join(project_dir, '.sureai'), exist_ok=True)

            # Step 1: Create a brief UI/UX directive for traceability
            create_agent_file_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+INSTRUCTIONS:
+1. Create a concise UI/UX directive tailored to this user prompt and the selected frontend stack.
+2. Create the file: {ux_agent_file}
+3. Outline the design philosophy, component strategy, theming approach, accessibility priorities, and responsive layout grid.
+
+Create the UI/UX directive file now:
+"""

            gemini_client = self._get_gemini_client()
            self._log_prompt_to_gemini("ui_ux_agent_file_creation", create_agent_file_prompt, agent_prompt, previous_docs)
            _ = gemini_client.generate_single_response(create_agent_file_prompt, working_dir=project_dir, agent_name="ui_ux")

            # Step 2: Generate .sureai/ui-ux.md referring ONLY to tech_stack_document.md
            create_ux_prompt = f"""
+{agent_prompt}
+
+USER PROMPT:
+{agent_output}
+
+REFERENCE FILES (ONLY):
+@.sureai/tech_stack_document.md
+
+INSTRUCTIONS:
+1. Read the tech stack document and generate a clear, actionable `.sureai/ui-ux.md` describing a modern component library and UX guidelines aligned to the chosen FRONTEND stack.
+2. Include at minimum:
+   - Design tokens: color palette (light/dark), typography scale, spacing, radius, elevation, motion.
+   - Theming: light/dark strategy, CSS variables/tokens, theme switching approach for the chosen stack.
+   - Layout: responsive grid/breakpoints, container widths, app shell patterns (header, sidebar, footer), page templates.
+   - Accessibility: WCAG basics, keyboard/focus, ARIA patterns for complex widgets.
+   - Core components with brief API notes and when-to-use: Button, Input, Select, Textarea, Checkbox, Radio, Toggle/Switch, Badge, Avatar, Tooltip, Popover, Modal/Drawer, Toast/Alert, Tabs, Accordion, Breadcrumbs, Pagination, Card, Table/DataGrid, List/VirtualList, Stepper, Skeleton/Loading, Empty states.
+   - Data viz (if relevant to stack): chart primitives and lib choice based on stack (e.g., Recharts/ECharts/Chart.js), theming hooks.
+   - Forms: validation strategy and library (Formik/React Hook Form/VeeValidate/Angular Forms), error patterns, async submit.
+   - Navigation: routing conventions for the stack (Next.js/Vue Router/Angular Router/SvelteKit), active states, breadcrumbs.
+   - State management (UI-level): where to keep UI state (local vs context/store), optimistic UI, loading/skeleton patterns.
+   - Internationalization (if applicable): library choice and message patterns.
+   - Performance: code-splitting, lazy-loading, memoization, virtualization patterns.
+   - Recommended UI library or headless components matching the stack (e.g., React: MUI/Tailwind+Headless UI/Shadcn; Vue: Vuetify/Naive UI; Angular: Angular Material; Svelte: Skeleton/Tailwind).
+3. Provide quick setup snippets/configs aligned to the stack (e.g., install commands, theme provider setup, Tailwind config if applicable).
+4. Keep it practical and concise with headings and bullet points. Tailor names and examples to the detected stack from tech_stack_document.md.
+
+CRITICAL FILE PATH REQUIREMENTS:
+- MUST create `.sureai/ui-ux.md` in the `.sureai/` directory (NOT in root)
+- Use explicit file path `.sureai/ui-ux.md`
+
+Create and save the UI/UX document now:
+"""

            self._log_prompt_to_gemini("ui_ux_creation", create_ux_prompt, agent_prompt, previous_docs)
            response = gemini_client.generate_single_response(create_ux_prompt, working_dir=project_dir, agent_name="ui_ux")

            created = False
            try:
                if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                    created = True
            except Exception:
                created = False

            if not created and isinstance(response, str) and response.strip() and not response.strip().lower().startswith("error generating response"):
                try:
                    with open(output_path, 'w', encoding='utf-8') as f:
                        f.write(response)
                    created = os.path.getsize(output_path) > 0
                except Exception:
                    created = False

            return {
                'status': 'success' if created else 'partial',
                'response': response,
                'files_created': [output_rel] if created else [],
                'message': 'UI/UX document created' if created else 'Attempted to create UI/UX document; file missing or empty'
            }
        except Exception as e:
            logger.error(f"Error in UI/UX phase: {str(e)}")
            return {'status': 'error', 'error': str(e)}

    def _build_memory_block(self, task_id: str, agent_name: str) -> str:
        """Compose memory summary + latest JSON + active-file hint for inclusion in CLI prompts."""
        try:
            from src.core.task_manager import TaskManager
            tm = TaskManager()
            mem = tm.get_task_memory(task_id)
            summary = []
            history = mem.get('history', [])[-3:]
            if history:
                summary.append("=== MEMORY (Recent runs) ===")
                for item in history:
                    ts = item.get('timestamp') or ''
                    pr = item.get('prompt') or ''
                    wf = item.get('workflow_id') or ''
                    prog = item.get('agents_progress') or {}
                    completed = ", ".join(prog.get('completed', []) or [])
                    remaining = ", ".join(prog.get('remaining', []) or [])
                    summary.append(f"- [{ts}] prompt: {pr}\n  workflow: {wf}\n  completed: {completed or '-'}\n  remaining: {remaining or '-'}")
            latest = mem.get('history', [])[-1] if mem.get('history') else None
            json_block = ""
            active_hint = ""
            if latest and isinstance(latest, dict):
                to_send = {
                    'prompt': latest.get('prompt'),
                    'workflow_id': latest.get('workflow_id'),
                    'agents_progress': latest.get('agents_progress', {}),
                    'agents_details': latest.get('agents_details', {}),
                }
                json_block = "\n\n=== MEMORY JSON (Latest) ===\n" + json.dumps(to_send, indent=2)
                details = (to_send.get('agents_details') or {}).get(agent_name) or {}
                in_progress_file = details.get('in_progress_file')
                if in_progress_file:
                    active_hint = f"\n\n=== ACTIVE FILE FOR {agent_name.upper()} ===\nContinue from this file: @{in_progress_file}\n(If the file is missing, recreate it and resume where you left off.)"
            pieces = []
            if summary:
                pieces.append("\n\n" + "\n".join(summary))
            if json_block:
                pieces.append(json_block)
            if active_hint:
                pieces.append(active_hint)
            return "".join(pieces)
        except Exception:
            return ""