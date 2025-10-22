"""
Orchestrator Module for BMAD System

This module implements the BMAD methodology (Break down, Make a plan, Act, Debug).
It determines the sequence of agents to invoke based on the workflow, injects context,
and handles agent handoffs. It also manages credit and token metering logic.
"""

import os
import yaml
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum
from src.core.task_manager import TaskManager, TaskState, TaskStatus
from src.core.context_manager import ContextManager
from src.llm_clients.gemini_api_client import GeminiAPIClient
from src.utils.logger import get_logger
from src.utils.token_meter import TokenMeter

logger = get_logger(__name__)

class AgentType(Enum):
    ARCHITECT = "architect"
    PROJECT_MANAGER = "pm"
    PRODUCT_OWNER = "po"
    SCRUM_MASTER = "sm"
    DEVELOPER = "dev"
    DEVOPS = "devops-pe"
    QA_TESTER = "qa_tester"

@dataclass
class WorkflowStep:
    """Represents a single step in a workflow"""
    agent_type: AgentType
    task_description: str
    dependencies: List[str] = None
    parallel_execution: bool = False

@dataclass
class Workflow:
    """Represents a complete workflow"""
    name: str
    description: str
    steps: List[WorkflowStep]
    keywords: List[str]

class Orchestrator:
    """Main orchestrator for the BMAD system"""
    
    def __init__(self):
        self.task_manager = TaskManager()
        self.context_manager = ContextManager()
        self.gemini_client = GeminiAPIClient()
        self.token_meter = TokenMeter()
        self.workflows = self._load_workflows()
        self.default_agent_sequence = [
            AgentType.ARCHITECT,
            AgentType.PROJECT_MANAGER,
            AgentType.PRODUCT_OWNER,
            AgentType.SCRUM_MASTER,
            AgentType.DEVELOPER,
            AgentType.QA_TESTER
        ]
        self.max_debug_attempts = 3
        self.max_build_time_minutes = 60
    
    def _load_workflows(self) -> Dict[str, Workflow]:
        # Loads workflow definitions from YAML files in workflows directory
        """Load workflow definitions from YAML files"""
        workflows = {}
        workflows_dir = os.path.join(os.path.dirname(__file__), "..", "workflows")
        
        # Create default workflow if directory doesn't exist
        if not os.path.exists(workflows_dir):
            os.makedirs(workflows_dir, exist_ok=True)
            self._create_default_workflows(workflows_dir)
        
        # Load all YAML files in workflows directory
        for filename in os.listdir(workflows_dir):
            if filename.endswith('.yml') or filename.endswith('.yaml'):
                filepath = os.path.join(workflows_dir, filename)
                try:
                    with open(filepath, 'r') as f:
                        workflow_data = yaml.safe_load(f)
                        workflow = self._parse_workflow(workflow_data)
                        workflows[workflow.name] = workflow
                except Exception as e:
                    logger.error(f"Error loading workflow {filename}: {e}")
        
        return workflows
    
    def _create_default_workflows(self, workflows_dir: str):
        # Creates default workflow files if workflows directory is empty
        """Create default workflow files"""
        default_workflow = {
            'name': 'default_development',
            'description': 'Default software development workflow',
            'keywords': ['build', 'create', 'develop', 'code', 'application', 'website', 'system'],
            'steps': [
                {
                    'agent_type': 'architect',
                    'task_description': 'Design system architecture and technical specifications',
                    'dependencies': []
                },
                {
                    'agent_type': 'pm',
                    'task_description': 'Create project requirements and management plan',
                    'dependencies': ['architect']
                },
                {
                    'agent_type': 'po',
                    'task_description': 'Define user stories and acceptance criteria',
                    'dependencies': ['pm']
                },
                {
                    'agent_type': 'sm',
                    'task_description': 'Set up development process and sprint planning',
                    'dependencies': ['po']
                },
                {
                    'agent_type': 'dev',
                    'task_description': 'Implement the application code',
                    'dependencies': ['sm']
                },
                {
                    'agent_type': 'qa_tester',
                    'task_description': 'Test the application and ensure quality',
                    'dependencies': ['dev']
                }
            ]
        }
        
        with open(os.path.join(workflows_dir, 'default_workflow.yml'), 'w') as f:
            yaml.dump(default_workflow, f, default_flow_style=False)
    
    def _parse_workflow(self, workflow_data: Dict[str, Any]) -> Workflow:
        # Converts YAML workflow data to Workflow dataclass object
        """Parse workflow data from YAML"""
        steps = []
        for step_data in workflow_data.get('steps', []):
            step = WorkflowStep(
                agent_type=AgentType(step_data['agent_type']),
                task_description=step_data['task_description'],
                dependencies=step_data.get('dependencies', []),
                parallel_execution=step_data.get('parallel_execution', False)
            )
            steps.append(step)
        
        return Workflow(
            name=workflow_data['name'],
            description=workflow_data['description'],
            steps=steps,
            keywords=workflow_data.get('keywords', [])
        )
    
    def select_workflow(self, user_prompt: str) -> Workflow:
        """Select the best workflow based on user prompt keywords"""
        prompt_lower = user_prompt.lower()
        best_match = None
        best_score = 0
        
        for workflow in self.workflows.values():
            score = 0
            for keyword in workflow.keywords:
                if keyword.lower() in prompt_lower:
                    score += 1
            
            if score > best_score:
                best_score = score
                best_match = workflow
        
        # Return default workflow if no match found
        if best_match is None:
            return list(self.workflows.values())[0] if self.workflows else self._create_default_workflow()
        
        return best_match
    
    def _create_default_workflow(self) -> Workflow:
        """Create a default workflow when none exist"""
        steps = []
        for agent_type in self.default_agent_sequence:
            step = WorkflowStep(
                agent_type=agent_type,
                task_description=f"Execute {agent_type.value} tasks"
            )
            steps.append(step)
        
        return Workflow(
            name="default",
            description="Default workflow",
            steps=steps,
            keywords=["default"]
        )
    
    async def execute_task(self, task_id: str) -> bool:
        """
        Execute a task using the BMAD methodology
        
        Args:
            task_id: The task ID to execute
            
        Returns:
            bool: True if task completed successfully, False otherwise
        """
        try:
            # Get task and state
            task = self.task_manager.get_task(task_id)
            if not task:
                logger.error(f"Task {task_id} not found")
                return False
            
            state = self.task_manager.get_task_state(task_id)
            if not state:
                logger.error(f"Task state for {task_id} not found")
                return False
            
            # Update task status to in_progress
            self.task_manager.update_task_status(task_id, TaskStatus.IN_PROGRESS)
            
            # Select workflow
            workflow = self.select_workflow(task['user_prompt'])
            logger.info(f"Selected workflow: {workflow.name} for task {task_id}")
            
            # Execute workflow steps
            success = await self._execute_workflow(task_id, workflow, state)
            
            # Update final status
            final_status = TaskStatus.COMPLETED if success else TaskStatus.FAILED
            self.task_manager.update_task_status(task_id, final_status)
            
            return success
            
        except Exception as e:
            logger.error(f"Error executing task {task_id}: {e}")
            self.task_manager.update_task_status(task_id, TaskStatus.FAILED, error_message=str(e))
            return False
    
    async def _execute_workflow(self, task_id: str, workflow: Workflow, state: TaskState) -> bool:
        """Execute all steps in a workflow"""
        try:
            for i, step in enumerate(workflow.steps):
                # Update current agent and progress
                state.current_agent = step.agent_type.value
                state.progress_percentage = (i / len(workflow.steps)) * 100
                state.agent_sequence_index = i
                
                self.task_manager.update_task_state(task_id, state)
                
                # Check if task should be paused or cancelled
                current_task = self.task_manager.get_task(task_id)
                if current_task['status'] in ['paused', 'cancelled']:
                    logger.info(f"Task {task_id} {current_task['status']}, stopping execution")
                    return False
                
                # Execute the step
                success = await self._execute_step(task_id, step, state)
                if not success:
                    logger.error(f"Step {step.agent_type.value} failed for task {task_id}")
                    return False
                
                # Mark step as completed
                state.completed_tasks.append(f"{step.agent_type.value}_{i}")
                self.task_manager.update_task_state(task_id, state)
            
            # Final progress update
            state.progress_percentage = 100
            self.task_manager.update_task_state(task_id, state)
            
            return True
            
        except Exception as e:
            logger.error(f"Error executing workflow for task {task_id}: {e}")
            return False
    
    async def _execute_step(self, task_id: str, step: WorkflowStep, state: TaskState) -> bool:
        """Execute a single workflow step"""
        try:
            # Load agent prompt
            agent_prompt = self._load_agent_prompt(step.agent_type)
            if not agent_prompt:
                logger.error(f"Could not load prompt for agent {step.agent_type.value}")
                return False
            
            # Prepare context
            context = await self.context_manager.prepare_context(task_id, state)
            
            # Create full prompt with context
            full_prompt = self._create_full_prompt(agent_prompt, step.task_description, context)
            
            # Execute with Gemini
            response = await self.gemini_client.generate_response(
                prompt=full_prompt,
                task_id=task_id
            )
            
            if not response:
                logger.error(f"No response from Gemini for step {step.agent_type.value}")
                return False
            
            # Process response and update context
            success = await self.context_manager.process_agent_response(
                task_id, step.agent_type.value, response, state
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Error executing step {step.agent_type.value}: {e}")
            return False
    
    def _load_agent_prompt(self, agent_type: AgentType) -> Optional[str]:
        """Load agent prompt from file"""
        try:
            agents_dir = os.path.join(os.path.dirname(__file__), "..", "agents")
            prompt_file = f"{agent_type.value}.chatmode.md"
            prompt_path = os.path.join(agents_dir, prompt_file)
            
            if os.path.exists(prompt_path):
                with open(prompt_path, 'r') as f:
                    return f.read()
            else:
                logger.warning(f"Prompt file not found: {prompt_path}")
                return None
                
        except Exception as e:
            logger.error(f"Error loading agent prompt for {agent_type.value}: {e}")
            return None
    
    def _create_full_prompt(self, agent_prompt: str, task_description: str, context: Dict[str, Any]) -> str:
        """Create full prompt with agent prompt, task description, and context"""
        context_str = ""
        if context.get('prd_content'):
            context_str += f"\\n\\n## Project Requirements Document\\n{context['prd_content']}"
        if context.get('tasks_content'):
            context_str += f"\\n\\n## Current Tasks\\n{context['tasks_content']}"
        if context.get('previous_outputs'):
            context_str += f"\\n\\n## Previous Agent Outputs\\n{context['previous_outputs']}"
        
        full_prompt = f"""
{agent_prompt}

## Current Task
{task_description}

## Context
{context_str}

## Instructions
Please execute your role as defined above, focusing on the current task while considering the provided context.
"""
        return full_prompt
    
    async def handle_debug_loop(self, task_id: str, error_message: str, state: TaskState) -> bool:
        """Handle the debug loop when QA tester finds errors"""
        try:
            state.debug_attempts += 1
            
            if state.debug_attempts > self.max_debug_attempts:
                logger.error(f"Max debug attempts reached for task {task_id}")
                return False
            
            # Create debug task for developer
            debug_step = WorkflowStep(
                agent_type=AgentType.DEVELOPER,
                task_description=f"Fix the following error: {error_message}"
            )
            
            # Execute debug step
            success = await self._execute_step(task_id, debug_step, state)
            
            if success:
                # Re-run QA testing
                qa_step = WorkflowStep(
                    agent_type=AgentType.QA_TESTER,
                    task_description="Re-test the application after bug fixes"
                )
                return await self._execute_step(task_id, qa_step, state)
            
            return False
            
        except Exception as e:
            logger.error(f"Error in debug loop for task {task_id}: {e}")
            return False
    
    def get_task_progress(self, task_id: str) -> Dict[str, Any]:
        """Get detailed progress information for a task"""
        task = self.task_manager.get_task(task_id)
        state = self.task_manager.get_task_state(task_id)
        
        if not task or not state:
            return {}
        
        return {
            'task_id': task_id,
            'status': task['status'],
            'current_agent': state.current_agent,
            'progress_percentage': state.progress_percentage,
            'completed_tasks': state.completed_tasks,
            'debug_attempts': state.debug_attempts,
            'agent_sequence_index': state.agent_sequence_index
        }

