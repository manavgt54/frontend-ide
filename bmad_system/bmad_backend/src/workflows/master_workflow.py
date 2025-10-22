"""
Master Workflow Module for Adaptive System

This module implements the master workflow orchestration logic that processes
user prompts and coordinates agent execution with detailed CLI-like logging.
Updated to use prompt references to reduce request size and avoid rate limiting.
"""

import asyncio
import json
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
from src.utils.logger import get_logger
from src.agents.agent_manager import AgentManager
from src.llm_clients.gemini_cli_client import GeminiCLIClient
from src.utils.token_meter import TokenMeter

logger = get_logger(__name__)

class MasterWorkflow:
    """Orchestrates the master workflow for Adaptive System with CLI-like logging"""
    
    def __init__(self, agent_manager: AgentManager, gemini_client: GeminiCLIClient, token_meter: TokenMeter):
        self.agent_manager = agent_manager
        self.gemini_client = gemini_client
        self.token_meter = token_meter
        self.cli_logs = []  # Store CLI-like logs for frontend
        self.current_task_id: Optional[str] = None
        
        # Initialize task manager
        from src.core.task_manager import TaskManager
        self.task_manager = TaskManager()
        
        # Set up CLI logging callback
        self.gemini_client.set_log_callback(self._handle_cli_log)
    
    def _handle_cli_log(self, level: str, message: str):
        """Handle CLI log messages and store them for frontend"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
            "source": "gemini_cli",
            "task_id": self.current_task_id or ""
        }
        self.cli_logs.append(log_entry)
        
        # Also log to main logger
        if level == "INFO":
            logger.info(f"[Gemini CLI] {message}")
        elif level == "ERROR":
            logger.error(f"[Gemini CLI] {message}")
        elif level == "WARNING":
            logger.warning(f"[Gemini CLI] {message}")
        elif level == "DEBUG":
            logger.debug(f"[Gemini CLI] {message}")
    
    def get_cli_logs(self) -> List[Dict[str, Any]]:
        """Get all CLI logs for frontend display"""
        return self.cli_logs.copy()
    
    def clear_cli_logs(self):
        """Clear CLI logs"""
        self.cli_logs = []
    
    async def execute_workflow(self, task_id: str, user_prompt: str, workflow_sequence: List[str] = None, 
                             custom_prompts: Dict[str, str] = None, per_agent_models: List[str] = None, per_agent_temperatures: List[Optional[float]] = None):
        """
        Execute the master workflow for a given task
        
        Args:
            task_id: The task identifier
            user_prompt: The user's input prompt
            workflow_sequence: Custom workflow sequence (optional)
            custom_prompts: Custom prompts for agents (optional)
            per_agent_models: Optional list of model names aligned to workflow_sequence
            per_agent_temperatures: Optional list of temperatures aligned to workflow_sequence
            
        Returns:
            Dict containing workflow execution results
        """
        try:
            from src.core.task_manager import TaskManager, TaskStatus
            from src.llm_clients.gemini_cli_client import GeminiCLIError
            task_manager = TaskManager()
            
            # Resolve sequence, etc. (existing code)
            if workflow_sequence:
                agents_to_execute = workflow_sequence
            else:
                agents_to_execute = self.agent_manager.get_default_workflow_sequence()
            per_agent_models = per_agent_models or []
            if len(per_agent_models) < len(agents_to_execute):
                per_agent_models = per_agent_models + [None] * (len(agents_to_execute) - len(per_agent_models))
            per_agent_temperatures = per_agent_temperatures or []
            if len(per_agent_temperatures) < len(agents_to_execute):
                per_agent_temperatures = per_agent_temperatures + [None] * (len(agents_to_execute) - len(per_agent_temperatures))
            self.current_task_id = task_id
            
            # Save sequence to state (existing code)
            try:
                tm = TaskManager()
                state = tm.get_task_state(task_id)
                if state and isinstance(state.context, dict):
                    state.context['agent_sequence'] = agents_to_execute
                    state.context['agent_models'] = per_agent_models
                    state.context['agent_temperatures'] = per_agent_temperatures
                    tm.update_task_state(task_id, state)
            except Exception:
                pass

            # Initialize memory progress (existing code)
            try:
                self.task_manager.update_latest_memory_progress(task_id, [], list(agents_to_execute))
            except Exception:
                pass

            # Start logs and status
            self._handle_cli_log("INFO", f"🚀 Starting Adaptive System workflow execution")
            self._handle_cli_log("INFO", f"📋 Task ID: {task_id}")
            self._handle_cli_log("INFO", f"👥 Agents in sequence: {', '.join(agents_to_execute)}")
            self._handle_cli_log("INFO", f"💬 User prompt: {user_prompt[:100]}{'...' if len(user_prompt) > 100 else ''}")
            task_manager.update_task_status(task_id, TaskStatus.IN_PROGRESS)
            
            context = {'user_prompt': user_prompt, 'task_id': task_id}
            
            for i, agent_name in enumerate(agents_to_execute):
                try:
                    requested_model = per_agent_models[i] if i < len(per_agent_models) else None
                    requested_temperature = None
                    try:
                        requested_temperature = per_agent_temperatures[i] if i < len(per_agent_temperatures) else None
                    except Exception:
                        requested_temperature = None
                    if requested_model:
                        try:
                            original_model = self.gemini_client.get_model_info().get('model_name')
                            self._handle_cli_log("INFO", f"🎯 Switching model to {requested_model} for {agent_name}")
                            self.gemini_client.switch_model(requested_model)
                        except Exception as e:
                            self._handle_cli_log("ERROR", f"Failed to switch to {requested_model} for {agent_name}: {e}")
                    start_progress = int((i / len(agents_to_execute)) * 100)
                    task_manager.update_task_progress(task_id, agent_name, start_progress)
                    
                    self._handle_cli_log("INFO", f"🤖 Executing agent {i+1}/{len(agents_to_execute)}: {agent_name}")
                    agent_prompt = custom_prompts[agent_name] if (custom_prompts and agent_name in custom_prompts) else self.agent_manager.get_agent_prompt(agent_name)
                    if not agent_prompt:
                        raise Exception(f"Agent {agent_name} missing prompt")
                    agent_input = self._prepare_agent_input(user_prompt, context, agent_prompt, agent_name)
                    
                    # Explicitly log presence of memory blocks for observability
                    try:
                        if "=== MEMORY JSON (Latest) ===" in agent_input:
                            idx = agent_input.find("=== MEMORY JSON (Latest) ===")
                            snippet = agent_input[idx: idx + 800]
                            self._handle_cli_log("DEBUG", f"🧠 Memory JSON included for {agent_name}:\n{snippet}")
                        else:
                            self._handle_cli_log("WARNING", f"🧠 Memory JSON block not found in prompt for {agent_name}")
                        if "=== ACTIVE FILE FOR" in agent_input:
                            idx2 = agent_input.find("=== ACTIVE FILE FOR")
                            snip2 = agent_input[idx2: idx2 + 300]
                            self._handle_cli_log("DEBUG", f"📎 Active file hint included for {agent_name}:\n{snip2}")
                    except Exception:
                        pass
                    
                    self._handle_cli_log("INFO", f"📤 Sending prompt to Gemini CLI for {agent_name}")
                    self._handle_cli_log("DEBUG", f"📊 Input length: {len(agent_input)} characters")
                    
                    if agent_name == 'developer':
                        self._handle_cli_log("INFO", "ℹ️ Skipping generic chat response for developer; proceeding directly to code generation tasks")
                        response = "OK"
                    else:
                        response = await self.gemini_client.send_message(
                            agent_input,
                            context={
                                "agent": agent_name,
                                "task_id": task_id,
                                "step": f"{i+1}/{len(agents_to_execute)}",
                                "temperature": requested_temperature if requested_temperature is not None else ''
                            },
                            agent_name=agent_name,
                            temperature=requested_temperature
                        )
                        if response is None or (isinstance(response, str) and response.strip() == ""):
                            raise Exception("Empty response from Gemini CLI")
                    
                    output_file = await self._save_agent_output(task_id, agent_name, response)
                    self._handle_cli_log("INFO", f"✅ {agent_name} completed successfully")
                    self._handle_cli_log("INFO", f"💾 Output saved to: {os.path.basename(output_file)}")
                    context[f'{agent_name}_output'] = response
                    context[f'{agent_name}_file'] = output_file
                    
                    self._handle_cli_log("INFO", f"🔧 Executing tasks for {agent_name}...")
                    task_result = await self._execute_agent_tasks(task_id, agent_name, user_prompt)
                    try:
                        files_created = (task_result or {}).get('files_created') or []
                        if files_created:
                            self.task_manager.update_agent_artifacts(task_id, agent_name, files_created)
                    except Exception:
                        pass
                    
                    if agent_name == 'developer':
                        remaining = task_result.get('remaining_subtasks', 0)
                        attempt = 1
                        max_attempts = 15
                        while remaining and attempt <= max_attempts:
                            self._handle_cli_log("INFO", f"🔁 Developer continuation attempt {attempt}/{max_attempts}. Remaining subtasks: {remaining}")
                            next_result = await self._execute_agent_tasks(task_id, agent_name, user_prompt)
                            prev_remaining = remaining
                            remaining = next_result.get('remaining_subtasks', remaining)
                            if isinstance(next_result.get('files_created'), list):
                                created_files = task_result.get('files_created', [])
                                created_files.extend(f for f in next_result['files_created'] if f not in created_files)
                                task_result['files_created'] = created_files
                            try:
                                self.task_manager.update_agent_artifacts(task_id, agent_name, task_result.get('files_created') or [])
                            except Exception:
                                pass
                            attempt += 1
                            if remaining and remaining >= prev_remaining:
                                await asyncio.sleep(3)
                    elif agent_name == 'tester':
                        remaining_tests = task_result.get('remaining_tests', 0)
                        attempt = 1
                        max_attempts = 10
                        while remaining_tests and attempt <= max_attempts:
                            self._handle_cli_log("INFO", f"🔁 Tester continuation attempt {attempt}/{max_attempts}. Remaining subtests: {remaining_tests}")
                            next_result = await self._execute_agent_tasks(task_id, agent_name, user_prompt)
                            prev_remaining = remaining_tests
                            remaining_tests = next_result.get('remaining_tests', remaining_tests)
                            if isinstance(next_result.get('files_created'), list):
                                created_files = task_result.get('files_created', [])
                                created_files.extend(f for f in next_result['files_created'] if f not in created_files)
                                task_result['files_created'] = created_files
                            try:
                                self.task_manager.update_agent_artifacts(task_id, agent_name, task_result.get('files_created') or [])
                            except Exception:
                                pass
                            attempt += 1
                    
                    try:
                        completed = [a for a in agents_to_execute[:i+1]]
                        remaining = [a for a in agents_to_execute[i+1:]]
                        self.task_manager.update_latest_memory_progress(task_id, completed, remaining)
                    except Exception:
                        pass
                    
                    end_progress = int(((i + 1) / len(agents_to_execute)) * 100)
                    task_manager.update_task_progress(task_id, agent_name, end_progress)
                except GeminiCLIError as ge:
                    code = ge.code
                    msg = ge.message
                    self._handle_cli_log("ERROR", f"[ERROR] Gemini API error [{code}] for agent {agent_name}: {msg}")
                    try:
                        self.task_manager.update_latest_memory_error(task_id, agent_name, code, msg)
                    except Exception:
                        pass
                    task_manager.update_task_status(task_id, TaskStatus.FAILED, current_agent=agent_name, error_message=f"Gemini API error [{code}]")
                    return { 'status': 'failed', 'error': f'Gemini API error [{code}]', 'agent': agent_name, 'message': msg }
                except Exception as e:
                    self._handle_cli_log("ERROR", f"Error executing agent {agent_name}: {str(e)}")
                    task_manager.update_task_status(task_id, TaskStatus.FAILED, current_agent=agent_name, error_message=str(e))
                    return {'status': 'failed', 'agent': agent_name, 'error': str(e)}
            
            task_manager.update_task_progress(task_id, agents_to_execute[-1] if agents_to_execute else '', 100)
            task_manager.update_task_status(task_id, TaskStatus.COMPLETED)
            return {'status': 'completed', 'results': []}
        except Exception as e:
            logger.error(f"Error executing workflow for task {task_id}: {e}")
            return {'status': 'failed', 'error': str(e)}

    def _temperature_guidance(self, t: float) -> str:
        if t is None:
            return ""
        if t <= 0.15:
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

    def _prepare_agent_input(self, user_prompt: str, context: Dict[str, Any], 
                           agent_prompt: str, agent_name: str) -> str:
        """
        Prepare input for an agent with context from previous agents
        Now uses full agent prompts from AgentManager
        Also includes references to sequential documents created by previous agents
        
        Args:
            user_prompt: Original user prompt
            context: Context from previous agents
            agent_prompt: The agent's full prompt from AgentManager
            agent_name: Name of the current agent
            
        Returns:
            Formatted input string for the agent
        """
        # Build context from previous agents (limit to last 2 agents to keep size down)
        previous_work = ""
        context_keys = [key for key in context.keys() if key.endswith('_output') and key != 'user_prompt']
        # Only include last 2 agents' work to keep prompt size manageable
        recent_context_keys = context_keys[-2:] if len(context_keys) > 2 else context_keys
        
        for key in recent_context_keys:
            prev_agent = key.replace('_output', '')
            value = context[key]
            # Limit each agent's output to 500 characters to keep prompt size down
            truncated_value = value[:500] + "..." if len(value) > 500 else value
            previous_work += f"\n\n--- {prev_agent.upper()} OUTPUT ---\n{truncated_value}\n"
        
        # Include task memory summary (user prompts and agent progress only; no model responses)
        memory_block = ""
        active_file_block = ""
        memory_json_block = ""
        try:
            mem = self.task_manager.get_task_memory(context.get('task_id', ''))
            history = mem.get('history', [])[-3:]  # include last 3 runs for brevity
            if history:
                lines = ["=== MEMORY (Recent runs) ==="]
                for item in history:
                    ts = item.get('timestamp', '')
                    pr = item.get('prompt', '')
                    wf = item.get('workflow_id', '')
                    prog = item.get('agents_progress', {})
                    completed = ", ".join(prog.get('completed', []) or [])
                    remaining = ", ".join(prog.get('remaining', []) or [])
                    lines.append(f"- [{ts}] prompt: {pr}\n  workflow: {wf}\n  completed: {completed or '-'}\n  remaining: {remaining or '-'}")
                memory_block = "\n\n" + "\n".join(lines)
            # Latest entry JSON (prompt, progress, artifacts)
            latest = mem.get('history', [])[-1] if mem.get('history') else None
            if latest and isinstance(latest, dict):
                to_send = {
                    'prompt': latest.get('prompt'),
                    'workflow_id': latest.get('workflow_id'),
                    'agents_progress': latest.get('agents_progress', {}),
                    'agents_details': latest.get('agents_details', {}),
                }
                memory_json_block = "\n\n=== MEMORY JSON (Latest) ===\n" + json.dumps(to_send, indent=2)
                # Active file hint for current agent
                agents_details = latest.get('agents_details') or {}
                details = agents_details.get(agent_name) or {}
                in_progress_file = details.get('in_progress_file')
                if in_progress_file:
                    active_file_block = f"\n\n=== ACTIVE FILE FOR {agent_name.upper()} ===\nContinue from this file: @{in_progress_file}\n(If the file is missing, recreate it and resume where you left off.)"
        except Exception:
            pass
        
        # Add references to sequential documents created by previous agents
        sequential_docs = ""
        try:
            from src.core.task_manager import TaskManager
            task_manager = TaskManager()
            project_dir = task_manager.get_task_output_directory(context.get('task_id', ''))
            
            if project_dir and os.path.exists(project_dir):
                # Define which documents each agent should reference
                doc_references = {
                    'architect': ['.sureai/analysis_document.md', '.sureai/requirements_document.md'],
                    'pm': ['.sureai/analysis_document.md', '.sureai/architecture_document.md'],
                    'sm': ['.sureai/prd_document.md', '.sureai/tasks_list.md'],
                    'developer': ['.sureai/tasks_list.md', '.sureai/architecture_document.md', '.sureai/tech_stack_document.md'],
                    'devops': ['.sureai/architecture_document.md'],
                    'tester': ['.sureai/architecture_document.md', 'backend/', 'frontend/']
                }
                
                if agent_name in doc_references:
                    available_docs = []
                    for doc_name in doc_references[agent_name]:
                        doc_path = os.path.join(project_dir, doc_name)
                        if os.path.exists(doc_path):
                            try:
                                with open(doc_path, 'r', encoding='utf-8') as f:
                                    doc_content = f.read()
                                    # Limit document content to 300 characters
                                    truncated_doc = doc_content[:300] + "..." if len(doc_content) > 300 else doc_content
                                    available_docs.append(f"[DOC] {doc_name}:\n{truncated_doc}")
                            except Exception as e:
                                logger.warning(f"Could not read document {doc_name}: {e}")
                    
                    if available_docs:
                        sequential_docs = "\n\n=== SEQUENTIAL DOCUMENTS TO REFERENCE ===\n" + "\n\n".join(available_docs)
        except Exception as e:
            logger.warning(f"Could not load sequential documents: {e}")
        
        # Add special instructions for developer agent
        developer_instructions = ""
        if agent_name == 'developer':
            developer_instructions = """

=== SPECIAL INSTRUCTIONS FOR DEVELOPER ===
You are now in the CODE GENERATION PHASE. Instead of writing code in markdown format, you MUST use terminal commands to create the actual code files directly.

Use this format for your response:

```bash
# Create directory structure
mkdir -p src/components
mkdir -p src/styles

# Create Python Flask app
cat > src/app.py << 'EOF'
from flask import Flask, render_template
app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
EOF

# Create requirements.txt
cat > requirements.txt << 'EOF'
Flask==2.0.1
Werkzeug==2.0.1
EOF

# Create HTML template
cat > templates/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>My App</title>
</head>
<body>
    <h1>Welcome to My App</h1>
</body>
</html>
EOF
```

Respond with ONLY the terminal commands needed to create all the code files. Do not include any explanations or markdown formatting. Just the commands that will create the files.

# QUALITY GATES (must pass before you mark a main task as completed)
# - After completing ALL subtasks for a main task, run comprehensive testing of the entire main task functionality:
#   Python backend (if present):
#     - python -m py_compile <python_files>
#     - if command -v ruff >/dev/null 2>&1; then ruff .; fi
#     - if command -v mypy >/dev/null 2>&1; then mypy --ignore-missing-imports . || true; fi
#     - if tests exist: pytest -q || true (create minimal smoke tests if needed)
#   Node/TypeScript frontend (if present):
#     - if [ -f package.json ]; then npm install --silent || true; fi
#     - if command -v tsc >/dev/null 2>&1; then tsc -noEmit || true; fi
#     - if command -v eslint >/dev/null 2>&1; then eslint . || true; fi
#     - if package.json has build script: npm run build || true
"""
        
        # Compose final input
        input_sections = [
            f"=== AGENT PROMPT ({agent_name}) ===\n{agent_prompt}",
            f"\n\n=== USER PROMPT ===\n{user_prompt}",
            previous_work,
            memory_block,
            memory_json_block,
            active_file_block,
            sequential_docs,
            developer_instructions
        ]
        return "\n".join([s for s in input_sections if s])

    async def _save_agent_output(self, task_id: str, agent_name: str, output: str) -> str:
        """
        Save agent output - now handled by SequentialDocumentBuilder
        
        Args:
            task_id: Task identifier
            agent_name: Name of the agent
            output: Agent's output text
            
        Returns:
            Path to the saved file
        """
        try:
            # Import here to avoid circular imports
            from src.core.task_manager import TaskManager
            task_manager = TaskManager()
            
            # Get task output directory
            project_dir = task_manager.get_task_output_directory(task_id)
            if not project_dir:
                import tempfile, os
                project_dir = os.path.join(tempfile.gettempdir(), "adaptive_system_outputs", task_id)
                os.makedirs(project_dir, exist_ok=True)
            
            # Create .sureai directory if it doesn't exist
            sureai_dir = os.path.join(project_dir, ".sureai")
            os.makedirs(sureai_dir, exist_ok=True)
            
            # Create filename with dot prefix (hidden file)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f".{agent_name}_{timestamp}.md"
            file_path = os.path.join(sureai_dir, filename)
            
            # Agent output files are now created by SequentialDocumentBuilder via Gemini CLI
            # This method just returns the expected path for logging purposes
            self._handle_cli_log("INFO", f"[SAVE] Agent output will be saved by SequentialDocumentBuilder to {file_path}")
            return file_path
            
        except Exception as e:
            self._handle_cli_log("ERROR", f"Failed to prepare agent output path: {e}")
            # Return a fallback path
            return f"/tmp/.{agent_name}_{task_id}.md"

    async def _execute_agent_tasks(self, task_id: str, agent_name: str, user_prompt: str) -> Dict[str, Any]:
        """Execute tasks for a specific agent based on the user prompt"""
        try:
            from src.core.sequential_document_builder import SequentialDocumentBuilder
            
            # Get project directory
            project_dir = self.task_manager.get_task_output_directory(task_id)
            if not project_dir:
                self._handle_cli_log("WARNING", f"[WARNING] No project directory found for task {task_id}")
                return {
                    'status': 'skipped',
                    'reason': 'No project directory available'
                }
            
            # Initialize sequential document builder only
            doc_builder = SequentialDocumentBuilder()
            
            # Execute sequential document builder with the user prompt
            # This will create the agent-specific prompts and documents
            doc_result = doc_builder.execute_sequential_phase(task_id, agent_name, user_prompt, project_dir)
            
            # Return the document builder result
            return {
                'status': doc_result['status'],
                'document_building': doc_result,
                'files_created': doc_result.get('files_created', []),
                'remaining_subtasks': doc_result.get('remaining_subtasks', 0),
                'remaining_tests': doc_result.get('remaining_tests', 0)
            }
            
        except Exception as e:
            self._handle_cli_log("ERROR", f"[ERROR] Task execution error for {agent_name}: {str(e)}")
            return {
                'status': 'failed',
                'error': str(e)
            }

    async def _execute_project_generation(self, task_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute project generation based on agent outputs"""
        try:
            # Extract agent outputs from context
            agent_outputs = {}
            for key, value in context.items():
                if key.endswith('_output'):
                    agent_name = key.replace('_output', '')
                    agent_outputs[agent_name] = value
            
            if not agent_outputs:
                self._handle_cli_log("WARNING", "[WARNING] No agent outputs found for project generation")
                return {
                    'status': 'skipped',
                    'reason': 'No agent outputs available'
                }
            
            # Project generation is now handled by SequentialDocumentBuilder
            # The DevOps agent creates all deployment files directly
            self._handle_cli_log("INFO", f"[PROJECT] Project generation handled by SequentialDocumentBuilder")
            self._handle_cli_log("INFO", f"[SUCCESS] All files created by Gemini CLI via terminal commands")
            
            return {
                'status': 'completed',
                'message': 'Project generation handled by SequentialDocumentBuilder and Gemini CLI',
                'files_created': 'All files created by Gemini CLI via terminal commands'
            }
            
        except Exception as e:
            self._handle_cli_log("ERROR", f"[ERROR] Project execution error: {str(e)}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def get_workflow_status(self, task_id: str) -> Dict[str, Any]:
        """Get the current status of a workflow"""
        return {
            'task_id': task_id,
            'cli_logs': self.get_cli_logs(),
            'gemini_model': self.gemini_client.get_model_info()
        } 