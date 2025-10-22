"""
Agent Manager Module for Adaptive System

This module provides centralized management of agent prompts, including loading,
storing, updating, and resetting agent prompts. Updated to use prompt references
to reduce request size and avoid rate limiting.
"""

import os
import tempfile
import tempfile
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from src.utils.logger import get_logger

logger = get_logger(__name__)

@dataclass
class AgentPrompt:
    """Represents an agent prompt configuration"""
    name: str
    display_name: str
    description: str
    default_prompt: str
    current_prompt: str
    is_modified: bool = False
    
    def reset_to_default(self):
        """Reset current prompt to default"""
        self.current_prompt = self.default_prompt
        self.is_modified = False

class AgentManager:
    """Manages agent prompts and configurations with prompt references"""
    
    def __init__(self):
        # Use the correct path to the agents directory
        self.agents_dir = os.path.join(os.path.dirname(__file__))
        self.config_file = os.path.join(tempfile.gettempdir(), "adaptive_system_agent_config.json")
        self.agents: Dict[str, AgentPrompt] = {}
        self._handoff_prompts: Dict[str, str] = {}
        self._default_handoff_prompts: Dict[str, str] = self._build_default_handoff_prompts()
        self._load_default_agents()
        self._load_custom_config()

    def _build_default_handoff_prompts(self) -> Dict[str, str]:
        """Default handoff prompts shown in UI and used when no override is set."""
        return {
            # Keep concise but actionable; detailed flow lives in sequential builders
            "requirement_builder": (
                "For each file in .sureai/uploads, create a STRICT per-file JSON next to it (<basename>.json) and also an index at .sureai/requirements_extracted.json. "
                "Support images (OCR + UI elements + styles), PDFs (text + scanned/OCR), Excel (.xlsx sheets/headers/rows), and CSV (headers/rows). "
                "Use strict JSON only; include text_blocks and styles when present; no placeholders."
            ),
            "developer": (
                "Update .sureai/tasks_list.md by adding actionable subtasks. Implement code per structure file. "
                "Complete ALL subtasks for each main task, then write and run main-task-level unit tests and test the entire main task functionality. "
                "Only mark main tasks as complete after tests and checks pass AND writing a brief entry to .sureai/dev_test_log.md. Write 'TEST: PASS' or 'TEST: FAIL' at main task level. "
                "After ALL main tasks are completed, add and execute final 'Task X: Application Smoke Test' only then. "
                "Maintain .sureai/dev_test_log.md (timestamp, main task, test result). Respect existing directory structure. "
                "Strict sequencing (Task 1 → Task 2 → …); no extraneous output in tasks_list.md (clean Markdown only)."
            ),
            "documentation_agent": (
                "Generate two docs at project root: technical_manual.md (architecture, APIs, models, setup, deploy, security, performance) "
                "and user_manual.md (features, step-by-step guides, workflows, troubleshooting). Include TOC, tables for API specs, "
                "and cite only small important code snippets (<=20 lines) with file paths; summarize longer code. Sources: PRD, Architecture, backend/, frontend/."
            ),
            "analyst": (
                "Analyze Adaptive System outputs; produce analysis_document.md and requirements_document.md with clear, testable requirements and scope."
            ),
            "architect": (
                "From analysis & requirements, produce architecture_document.md and tech_stack_document.md with components, data flow, and stack choices."
            ),
            "pm": (
                "Create prd_document.md (with detailed EPIC STORIES and user stories) and project_plan.md based on analysis and architecture."
            ),
            "sm": (
                "Create tasks_list.md (ONLY main tasks; no subtasks) and sprint_plan.md from PRD epics. Include status sections and guidelines template."
            ),
            "devops": (
                "Expert DevOps Engineer specializing in containerization, deployment automation, and infrastructure as code. "
                "Create deployment_config.yml, Dockerfile.backend, Dockerfile.frontend, docker-compose.yml, nginx.conf at root. "
                "AFTER creating files: build and test containers with docker-compose build/up, fix any issues found, check logs, "
                "handle port/name conflicts without affecting existing containers. Mount Docker daemon socket for adaptive-system-backend service. "
                "Use dynamic container names based on user prompt (e.g., todo-frontend, todo-backend for 'todo app'). "
                "NEVER stop or modify existing running Docker services. Follow security best practices and implement proper monitoring."
            ),
            "tester": (
                "Create .sureai/test-list.md with multi-level tests per architecture component; tag E2E with [E2E/Selenium]; then execute pending tests sequentially."
            ),
            "orchestrator": (
                "Create .sureai/.orchestrator_breakdown.md and .sureai/.orchestrator_plan.md tailored to the user prompt to guide downstream agents."
            ),
            "directory_structure": (
                "Create project directories and placeholder files per specific directory plan; no application code at this phase."
            ),
            "po": "Refine product requirements and priorities as needed.",
            "coding_standards": (
                "Read .sureai/tech_stack_document.md and generate .sureai/coding-standard.md with practical, stack-aligned guidelines."
            ),
            "ui_ux": (
                "Read .sureai/tech_stack_document.md and generate .sureai/ui-ux.md describing a modern component library, design tokens, theming, accessibility, and UX patterns aligned to the chosen frontend stack."
            ),
        }

    def _load_default_agents(self):
        """Load default agent prompts from files"""
        try:
            # Define agent configurations
            agent_configs = {
                "directory_structure": {
                    "display_name": "Directory Structure Agent",
                    "description": "Creates and maintains proper directory structures for software projects",
                    "file": "directory_structure.chatmode.md"
                },
                "orchestrator": {
                    "display_name": "Orchestrator",
                    "description": "Master orchestrator following Adaptive System methodology",
                    "file": "orchestrator.chatmode.md"
                },
                "analyst": {
                    "display_name": "Business Analyst", 
                    "description": "Analyzes requirements and creates specifications",
                    "file": "analyst.chatmode.md"
                },
                "architect": {
                    "display_name": "System Architect",
                    "description": "Designs system architecture and technical specifications",
                    "file": "architect.chatmode.md"
                },
                "pm": {
                    "display_name": "Project Manager",
                    "description": "Manages project timeline and coordination",
                    "file": "pm.chatmode.md"
                },
                "sm": {
                    "display_name": "Scrum Master",
                    "description": "Facilitates agile processes and team coordination",
                    "file": "sm.chatmode.md"
                },
                "requirement_builder": {
                    "display_name": "Requirement Builder",
                    "description": "Extracts structured context from uploaded documents and images",
                    "file": "requirement_builder.chatmode.md"
                },
                "documentation_agent": {
                    "display_name": "Documentation Agent",
                    "description": "Generates Technical Manual and User Manual from PRD, architecture, and selected code snippets",
                    "file": "documentation_agent.chatmode.md"
                },
                "developer": {
                    "display_name": "Developer",
                    "description": "Implements code and technical solutions",
                    "file": "dev.ide.chatmode.md"
                },
                "devops": {
                    "display_name": "DevOps Engineer",
                    "description": "Handles deployment and infrastructure",
                    "file": "devops-pe.ide.chatmode.md"
                },
                "tester": {
                    "display_name": "Quality Assurance Tester",
                    "description": "Creates comprehensive test plans and test cases",
                    "file": "tester.chatmode.md"
                },
                "po": {
                    "display_name": "Product Owner",
                    "description": "Defines product requirements and priorities",
                    "file": "po.chatmode.md"
                },
                "web_search": {
                    "display_name": "Web Search Agent",
                    "description": "Performs deep web and market research with citations; outputs consolidated findings",
                    "file": "web_search.chatmode.md"
                },
                "deep_research": {
                    "display_name": "Deep Research Agent",
                    "description": "Performs multi-step, iterative deep research across trusted sources and long documents; produces citation-backed synthesis",
                    "file": "deep_research.chatmode.md"
                },
                "coding_standards": {
                    "display_name": "Coding Standards Agent",
                    "description": "Generates frontend and backend coding standards based on the selected technology stack",
                    "file": "coding_standards.chatmode.md"
                },
                "ui_ux": {
                    "display_name": "UI/UX Agent",
                    "description": "Creates UI component library and design guidelines aligned to the chosen frontend tech stack",
                    "file": "ui_ux.chatmode.md"
                },
            }
            
            # Load each agent's prompt
            for agent_name, config in agent_configs.items():
                try:
                    file_path = os.path.join(self.agents_dir, config["file"])
                    if os.path.exists(file_path):
                        with open(file_path, 'r', encoding='utf-8') as f:
                            prompt_content = f.read().strip()
                        
                        agent = AgentPrompt(
                            name=agent_name,
                            display_name=config["display_name"],
                            description=config["description"],
                            default_prompt=prompt_content,
                            current_prompt=prompt_content
                        )
                        self.agents[agent_name] = agent
                        logger.info(f"Loaded agent prompt for {agent_name}")
                    else:
                        logger.warning(f"Agent prompt file not found: {file_path}")
                except Exception as e:
                    logger.error(f"Error loading agent {agent_name}: {e}")
            
            logger.info(f"Loaded {len(self.agents)} agent prompts")
            
        except Exception as e:
            logger.error(f"Error loading default agents: {e}")
    
    def _load_custom_config(self):
        # Loads custom agent configurations from persistent storage file
        """Load custom agent configurations from file"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    config_data = json.load(f)
                
                for agent_name, agent_data in config_data.items():
                    if agent_name in self.agents:
                        agent = self.agents[agent_name]
                        agent.current_prompt = agent_data.get('current_prompt', agent.default_prompt)
                        agent.is_modified = agent_data.get('is_modified', False)
                # Load handoff prompts map if present
                if 'handoff_prompts' in config_data and isinstance(config_data['handoff_prompts'], dict):
                    self._handoff_prompts = config_data['handoff_prompts']
                
                logger.info("Loaded custom agent configurations")
                return config_data
        except Exception as e:
            logger.error(f"Error loading custom config: {e}")
        return {}
    
    def _save_custom_config(self, config_data=None):
        # Persists custom agent configurations to storage file for future sessions
        """Save custom agent configurations to file"""
        try:
            if config_data is None:
                config_data = {}
                for agent_name, agent in self.agents.items():
                    if agent.is_modified:
                        config_data[agent_name] = {
                            'current_prompt': agent.current_prompt,
                            'is_modified': agent.is_modified
                        }
                # Persist handoff prompts separately
                config_data['handoff_prompts'] = self._handoff_prompts
            
            with open(self.config_file, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            logger.info("Saved custom agent configurations")
        except Exception as e:
            logger.error(f"Error saving custom config: {e}")
    
    # Handoff prompt management
    def get_handoff_prompt(self, agent_name: str) -> str:
        # Retrieves custom handoff prompt for agent or falls back to default
        """Return the optional handoff prompt for an agent, or empty string if none"""
        saved = self._handoff_prompts.get(agent_name)
        if saved is not None and saved != "":
            return saved
        # Fallback to default mapping
        return self._default_handoff_prompts.get(agent_name, "")

    def update_handoff_prompt(self, agent_name: str, prompt: str) -> bool:
        # Updates or sets custom handoff prompt for agent and persists changes
        """Update or set the handoff prompt for an agent and persist it"""
        try:
            self._handoff_prompts[agent_name] = prompt or ""
            self._save_custom_config()
            return True
        except Exception as e:
            logger.error(f"Error updating handoff prompt for {agent_name}: {e}")
            return False

    def get_all_agents(self) -> Dict[str, Dict[str, Any]]:
        # Combines built-in and custom agents with metadata for UI display
        """Get all agents with their information including custom agents"""
        agents_info = {}
        
        # Add built-in agents
        for agent_name, agent in self.agents.items():
            agents_info[agent_name] = {
                'name': agent.name,
                'display_name': agent.display_name,
                'description': agent.description,
                'is_modified': agent.is_modified,
                'prompt_preview': agent.current_prompt[:200] + "..." if len(agent.current_prompt) > 200 else agent.current_prompt,
                'is_custom': False,
                'instructions': self._get_built_in_instructions(agent_name),
                'handoff_prompt': self.get_handoff_prompt(agent_name)
            }
        
        # Add custom agents from database
        try:
            from src.models.custom_agent import CustomAgent
            from src.models.user import db
            
            custom_agents = CustomAgent.get_active_custom_agents()
            for custom_agent in custom_agents:
                agents_info[custom_agent.name] = {
                    'name': custom_agent.name,
                    'display_name': custom_agent.display_name,
                    'description': custom_agent.description,
                    'is_modified': False,
                    'prompt_preview': custom_agent.prompt[:200] + "..." if len(custom_agent.prompt) > 200 else custom_agent.prompt,
                    'is_custom': True,
                    'id': custom_agent.id,
                    'instructions': custom_agent.instructions,
                    'handoff_prompt': self.get_handoff_prompt(custom_agent.name)
                }
        except ImportError:
            logger.warning("CustomAgent model not available")
        except Exception as e:
            logger.error(f"Error loading custom agents: {e}")
        
        return agents_info

    def _get_built_in_instructions(self, agent_name: str) -> str:
        # Returns predefined instructions for each agent type based on their role
        """Get built-in instructions for agents"""
        instructions_map = {
            'developer': """You are now in the CODE GENERATION PHASE. Instead of writing code in markdown format, you MUST use terminal commands to create the actual code files directly.

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

Respond with ONLY the terminal commands needed to create all the code files. Do not include any explanations or markdown formatting. Just the commands that will create the files.""",
            'tester': """Explicitly mark any subtests requiring browser automation with [E2E/Selenium] in the test-list.md file.

For any subtest in test-list.md labeled [E2E/Selenium], implement tests using Selenium WebDriver (Chrome/ChromeDriver) in headless mode.

Create multiple subtests for each architectural component to ensure comprehensive coverage.""",
            'web_search': """Conduct thorough web research for the current user prompt. Prioritize authoritative, recent sources. Extract quotes and data points with inline citations. Synthesize market landscape, competitors, gaps, opportunities, UVPs, and recommendations. Save the complete report to `.sureai/web-results.md` in the required structure (Executive Summary, Strategy, Landscape, Competitors, Opportunities, UVPs, Brainstorming, Evidence/Citations, Recommendations).""",
            'deep_research': """Execute multi-step, iterative deep research tailored to the user prompt. Search across multiple trusted sources (including GitHub and reputable news/company sources), analyze long documents and datasets, resolve contradictions, and refine results. Provide a concise, well-structured, citation-backed synthesis. Write the final report directly to `.sureai/research-results.md` following the required structure (Plan & Strategy, Evidence, Synthesis, Iterative Refinement, Final Answer, References).""",
            'default': """Provide detailed, actionable output that the next agent in the sequence can use.

Focus on your area of expertise and build upon the work already completed.

If sequential documents are available, reference them in your analysis and recommendations."""
        }
        
        return instructions_map.get(agent_name, instructions_map['default'])
    
    def get_agent_prompt(self, agent_name: str) -> Optional[str]:
        # Retrieves current prompt for built-in or custom agent from storage
        """Get the current prompt for an agent (built-in or custom)"""
        if agent_name in self.agents:
            return self.agents[agent_name].current_prompt
        
        # Check for custom agent
        try:
            from src.models.custom_agent import CustomAgent
            custom_agent = CustomAgent.get_custom_agent_by_name(agent_name)
            if custom_agent:
                return custom_agent.prompt
        except ImportError:
            logger.warning("CustomAgent model not available")
        except Exception as e:
            logger.error(f"Error getting custom agent prompt: {e}")
        
        return None
    
    def get_agent_prompt_reference(self, agent_name: str) -> str:
        # Returns lightweight reference instead of full prompt to reduce request size
        """Get a reference to the agent prompt instead of the full prompt"""
        if agent_name in self.agents:
            agent = self.agents[agent_name]
            return f"Act as a {agent.display_name}. {agent.description}"
        return f"Act as a {agent_name} agent."
    
    def get_agent_info(self, agent_name: str) -> Optional[Dict[str, Any]]:
        # Returns detailed metadata about agent including display name and description
        """Get detailed information about an agent"""
        if agent_name in self.agents:
            agent = self.agents[agent_name]
            return {
                'name': agent.name,
                'display_name': agent.display_name,
                'description': agent.description,
                'current_prompt': agent.current_prompt,
                'is_modified': agent.is_modified
            }
        return None
    
    def update_agent_prompt(self, agent_name: str, new_prompt: str) -> bool:
        # Updates agent's current prompt and marks it as modified for persistence
        """Update an agent's prompt"""
        try:
            if agent_name in self.agents:
                agent = self.agents[agent_name]
                agent.current_prompt = new_prompt
                agent.is_modified = True
                self._save_custom_config()
                logger.info(f"Updated prompt for agent {agent_name}")
                return True
            else:
                logger.error(f"Agent {agent_name} not found")
                return False
        except Exception as e:
            logger.error(f"Error updating agent prompt: {e}")
            return False
    
    def reset_agent_prompt(self, agent_name: str) -> bool:
        # Restores agent's prompt to original default and clears modification flag
        """Reset an agent's prompt to default"""
        try:
            if agent_name in self.agents:
                agent = self.agents[agent_name]
                agent.reset_to_default()
                self._save_custom_config()
                logger.info(f"Reset prompt for agent {agent_name}")
                return True
            else:
                logger.error(f"Agent {agent_name} not found")
                return False
        except Exception as e:
            logger.error(f"Error resetting agent prompt: {e}")
            return False

    def update_agent_instructions(self, agent_name: str, new_instructions: str) -> bool:
        # Updates agent's execution instructions stored in configuration file
        """Update an agent's instructions"""
        try:
            if agent_name in self.agents:
                # For built-in agents, we'll store instructions in the config file
                # This is a simple approach - in a real system you might want a separate table
                config = self._load_custom_config()
                if 'instructions' not in config:
                    config['instructions'] = {}
                config['instructions'][agent_name] = new_instructions
                self._save_custom_config(config)
                logger.info(f"Updated instructions for agent {agent_name}")
                return True
            else:
                logger.error(f"Agent {agent_name} not found")
                return False
        except Exception as e:
            logger.error(f"Error updating agent instructions: {e}")
            return False

    def get_agent_instructions(self, agent_name: str) -> str:
        # Retrieves execution instructions for agent from custom config or built-in defaults
        """Get instructions for an agent (built-in or custom)"""
        try:
            # Check for custom agent first
            try:
                from src.models.custom_agent import CustomAgent
                custom_agent = CustomAgent.get_custom_agent_by_name(agent_name)
                if custom_agent and custom_agent.instructions:
                    return custom_agent.instructions
            except ImportError:
                logger.warning("CustomAgent model not available")
            except Exception as e:
                logger.warning(f"Error loading custom agent: {e}")
            
            # Check for built-in agent instructions
            config = self._load_custom_config()
            if 'instructions' in config and agent_name in config['instructions']:
                return config['instructions'][agent_name]
            
            # Return default instructions
            return self._get_built_in_instructions(agent_name)
        except Exception as e:
            logger.error(f"Error getting agent instructions: {e}")
            return self._get_built_in_instructions(agent_name)
    
    def get_agent_names(self) -> List[str]:
        # Returns list of all available agent names including built-in and custom agents
        """Get list of all agent names (built-in and custom)"""
        agent_names = list(self.agents.keys())
        
        # Add custom agent names
        try:
            from src.models.custom_agent import CustomAgent
            custom_agents = CustomAgent.get_active_custom_agents()
            for custom_agent in custom_agents:
                agent_names.append(custom_agent.name)
        except ImportError:
            logger.warning("CustomAgent model not available")
        except Exception as e:
            logger.error(f"Error getting custom agent names: {e}")
        
        return agent_names
    
    def validate_agent_name(self, agent_name: str) -> bool:
        # Checks if agent name exists in built-in agents list
        """Validate if an agent name exists"""
        return agent_name in self.agents
    
    def get_default_workflow_sequence(self) -> List[str]:
        # Returns predefined sequence of agents for standard software development workflow
        """Get the default workflow sequence"""
        return [
            "directory_structure",
            "orchestrator",
            "web_search",
            "deep_research",
            "analyst",
            "architect",
            "coding_standards",
            "ui_ux",
            "pm",
            "sm",
            "developer",
            "devops",
            "tester",
            "requirement_builder",
            "documentation_agent"
        ]
    
    def export_agent_config(self, file_path: str) -> bool:
        # Exports current agent configurations to external file for backup or sharing
        """Export agent configurations to a file"""
        try:
            config_data = {}
            for agent_name, agent in self.agents.items():
                config_data[agent_name] = {
                    'display_name': agent.display_name,
                    'description': agent.description,
                    'current_prompt': agent.current_prompt,
                    'is_modified': agent.is_modified
                }
            
            with open(file_path, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            logger.info(f"Exported agent config to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error exporting agent config: {e}")
            return False
    
    def import_agent_config(self, file_path: str) -> bool:
        # Imports agent configurations from external file and applies to current system
        """Import agent configurations from a file"""
        try:
            with open(file_path, 'r') as f:
                config_data = json.load(f)
            
            for agent_name, agent_data in config_data.items():
                if agent_name in self.agents:
                    agent = self.agents[agent_name]
                    agent.current_prompt = agent_data.get('current_prompt', agent.default_prompt)
                    agent.is_modified = agent_data.get('is_modified', False)
            
            self._save_custom_config()
            logger.info(f"Imported agent config from {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error importing agent config: {e}")
            return False 

# Global instance for other modules to import
agent_manager = AgentManager() 