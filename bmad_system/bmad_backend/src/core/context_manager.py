"""
Context Manager Module for Adaptive System

This module is responsible for managing the global context for each task.
This includes reading .PRD.md and .tasks.md before each LLM call, updating
.tasks.md with progress, and ensuring context is passed between agents.
"""

import os
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from src.core.task_manager import TaskState
from src.utils.logger import get_logger

logger = get_logger(__name__)

@dataclass
class ProjectContext:
    """Represents the context of a project"""
    prd_content: str = ""
    tasks_content: str = ""
    architecture_content: str = ""
    previous_outputs: Dict[str, str] = None
    project_files: List[str] = None
    
    def __post_init__(self):
        if self.previous_outputs is None:
            self.previous_outputs = {}
        if self.project_files is None:
            self.project_files = []

class ContextManager:
    """Manages context for tasks and agent interactions"""
    
    def __init__(self):
        pass
    
    async def prepare_context(self, task_id: str, state: TaskState) -> Dict[str, Any]:
        """
        Prepare context for an agent execution
        
        Args:
            task_id: The task ID
            state: Current task state
            
        Returns:
            Dict containing context information
        """
        try:
            project_path = state.context.get('project_path')
            io8_project_path = state.context.get('io8_project_path')
            
            if not project_path or not io8_project_path:
                logger.warning(f"Missing project paths for task {task_id}")
                return {}
            
            context = ProjectContext()
            
            # Read PRD content from .sureai directory
            prd_path = os.path.join(io8_project_path, ".sureai", "prd_document.md")
            if os.path.exists(prd_path):
                with open(prd_path, 'r') as f:
                    context.prd_content = f.read()
            
            # Read tasks content from .sureai directory
            tasks_path = os.path.join(io8_project_path, ".sureai", "tasks_list.md")
            if os.path.exists(tasks_path):
                with open(tasks_path, 'r') as f:
                    context.tasks_content = f.read()
            
            # Read architecture content from .sureai directory
            arch_path = os.path.join(io8_project_path, ".sureai", "architecture_document.md")
            if os.path.exists(arch_path):
                with open(arch_path, 'r') as f:
                    context.architecture_content = f.read()
            
            # Load previous agent outputs
            outputs_path = os.path.join(io8_project_path, "agent_outputs.json")
            if os.path.exists(outputs_path):
                with open(outputs_path, 'r') as f:
                    context.previous_outputs = json.load(f)
            
            # Get list of project files
            context.project_files = self._get_project_files(project_path)
            
            # Add uploaded files context
            uploaded_files = state.context.get('uploaded_files', [])
            uploaded_context = self._process_uploaded_files(uploaded_files)
            
            return {
                'prd_content': context.prd_content,
                'tasks_content': context.tasks_content,
                'architecture_content': context.architecture_content,
                'previous_outputs': self._format_previous_outputs(context.previous_outputs),
                'project_files': context.project_files,
                'uploaded_files_context': uploaded_context,
                'task_id': task_id,
                'current_agent_index': state.agent_sequence_index,
                'completed_tasks': state.completed_tasks
            }
            
        except Exception as e:
            logger.error(f"Error preparing context for task {task_id}: {e}")
            return {}
    
    async def process_agent_response(self, task_id: str, agent_name: str, 
                                   response: str, state: TaskState) -> bool:
        """
        Process agent response and update context files
        
        Args:
            task_id: The task ID
            agent_name: Name of the agent that generated the response
            response: The agent's response
            state: Current task state
            
        Returns:
            bool: True if processing was successful
        """
        try:
            io8_project_path = state.context.get('io8_project_path')
            if not io8_project_path:
                logger.error(f"Missing io8_project_path for task {task_id}")
                return False
            
            # Save agent output
            await self._save_agent_output(io8_project_path, agent_name, response)
            
            # Update tasks.md with progress
            await self._update_tasks_progress(io8_project_path, agent_name, response)
            
            # Process agent-specific outputs
            success = await self._process_agent_specific_output(
                io8_project_path, agent_name, response, state
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing agent response for task {task_id}: {e}")
            return False
    
    async def _save_agent_output(self, io8_project_path: str, agent_name: str, response: str):
        # Saves agent response to JSON file for tracking and context building
        """Save agent output to agent_outputs.json"""
        outputs_path = os.path.join(io8_project_path, "agent_outputs.json")
        
        # Load existing outputs
        outputs = {}
        if os.path.exists(outputs_path):
            with open(outputs_path, 'r') as f:
                outputs = json.load(f)
        
        # Add new output
        outputs[agent_name] = {
            'response': response,
            'timestamp': self._get_timestamp()
        }
        
        # Save updated outputs
        with open(outputs_path, 'w') as f:
            json.dump(outputs, f, indent=2)
    
    async def _update_tasks_progress(self, io8_project_path: str, agent_name: str, response: str):
        # Updates tasks_list.md with agent progress and response summary
        """Update tasks progress in .sureai directory"""
        # Create .sureai directory if it doesn't exist
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        tasks_path = os.path.join(sureai_path, "tasks_list.md")
        
        # Read current tasks
        tasks_content = ""
        if os.path.exists(tasks_path):
            with open(tasks_path, 'r') as f:
                tasks_content = f.read()
        
        # Add progress update
        progress_update = f"\\n\\n## {agent_name.upper()} Progress Update\\n"
        progress_update += f"**Timestamp:** {self._get_timestamp()}\\n\\n"
        progress_update += f"{response[:500]}..." if len(response) > 500 else response
        
        # Append to tasks file
        with open(tasks_path, 'w') as f:
            f.write(tasks_content + progress_update)
    
    async def _process_agent_specific_output(self, io8_project_path: str, agent_name: str, 
                                           response: str, state: TaskState) -> bool:
        # Routes agent responses to appropriate file extraction methods based on agent type
        """Process agent-specific outputs and create appropriate files"""
        try:
            if agent_name == "architect":
                # Extract architecture document from response
                await self._extract_and_save_architecture(io8_project_path, response)
            
            elif agent_name == "pm":
                # Extract PRD from response
                await self._extract_and_save_prd(io8_project_path, response)
            
            elif agent_name == "po":
                # Extract user stories and update tasks
                await self._extract_and_save_user_stories(io8_project_path, response)
            
            elif agent_name == "dev":
                # Extract code files from response
                await self._extract_and_save_code(io8_project_path, response, state)
            
            elif agent_name == "qa_tester":
                # Extract test results and handle errors
                return await self._process_qa_results(io8_project_path, response, state)
            
            return True
            
        except Exception as e:
            logger.error(f"Error processing {agent_name} specific output: {e}")
            return False
    
    async def _extract_and_save_architecture(self, io8_project_path: str, response: str):
        # Extracts architecture content from architect agent response and saves to markdown file
        """Extract architecture document from architect response"""
        # Create .sureai directory if it doesn't exist
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        arch_path = os.path.join(sureai_path, "architecture_document.md")
        
        # Simple extraction - look for markdown content
        # In a real implementation, this would be more sophisticated
        with open(arch_path, 'w') as f:
            f.write(f"# System Architecture\\n\\n{response}")
    
    async def _extract_and_save_prd(self, io8_project_path: str, response: str):
        # Extracts PRD content from project manager response and saves to markdown file
        """Extract PRD from PM response"""
        # Create .sureai directory if it doesn't exist
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        prd_path = os.path.join(sureai_path, "prd_document.md")
        
        with open(prd_path, 'w') as f:
            f.write(f"# Project Requirements Document\\n\\n{response}")
    
    async def _extract_and_save_user_stories(self, io8_project_path: str, response: str):
        # Extracts user stories from product owner response and saves to markdown file
        """Extract user stories from PO response"""
        # Create .sureai directory if it doesn't exist
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        stories_path = os.path.join(sureai_path, "user_stories.md")
        
        with open(stories_path, 'w') as f:
            f.write(f"# User Stories\\n\\n{response}")
    
    async def _extract_and_save_code(self, io8_project_path: str, response: str, state: TaskState):
        # Extracts code content from developer response and saves to development log
        """Extract code files from developer response"""
        # This is a simplified implementation
        # In reality, you'd parse the response for code blocks and file names
        project_path = state.context.get('project_path')
        if not project_path:
            return
        
        code_path = os.path.join(project_path, "src")
        os.makedirs(code_path, exist_ok=True)
        
        # Save development log in .sureai directory
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        dev_log_path = os.path.join(sureai_path, "development_log.md")
        with open(dev_log_path, 'a') as f:
            f.write(f"\\n\\n## Development Update - {self._get_timestamp()}\\n")
            f.write(response)
    
    async def _process_qa_results(self, io8_project_path: str, response: str, state: TaskState) -> bool:
        # Processes QA test results, saves to file, and checks for error indicators
        """Process QA test results and check for errors"""
        # Save test results in .sureai directory
        sureai_path = os.path.join(io8_project_path, ".sureai")
        os.makedirs(sureai_path, exist_ok=True)
        
        test_results_path = os.path.join(sureai_path, "test_results.md")
        with open(test_results_path, 'a') as f:
            f.write(f"\\n\\n## Test Results - {self._get_timestamp()}\\n")
            f.write(response)
        
        # Check if there are errors (simplified check)
        error_indicators = ["error", "failed", "exception", "bug"]
        has_errors = any(indicator in response.lower() for indicator in error_indicators)
        
        if has_errors:
            # Save error for debug loop
            state.context['last_error'] = response
            return False
        
        return True
    
    def _get_project_files(self, project_path: str) -> List[str]:
        # Recursively scans project directory to build list of all files for context
        """Get list of all files in the project directory"""
        files = []
        try:
            for root, dirs, filenames in os.walk(project_path):
                for filename in filenames:
                    rel_path = os.path.relpath(os.path.join(root, filename), project_path)
                    files.append(rel_path)
        except Exception as e:
            logger.error(f"Error getting project files: {e}")
        
        return files
    
    def _process_uploaded_files(self, uploaded_files: List[str]) -> str:
        # Reads uploaded file contents and formats them into context string for agents
        """Process uploaded files and create context string"""
        if not uploaded_files:
            return ""
        
        context = "## Uploaded Files Context\\n\\n"
        for file_path in uploaded_files:
            try:
                if os.path.exists(file_path):
                    # Read file content (simplified - would need proper parsing for different file types)
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()[:1000]  # Limit content length
                    context += f"### {os.path.basename(file_path)}\\n{content}\\n\\n"
            except Exception as e:
                logger.error(f"Error processing uploaded file {file_path}: {e}")
        
        return context
    
    def _format_previous_outputs(self, outputs: Dict[str, Any]) -> str:
        # Formats previous agent outputs into readable context string for next agent
        """Format previous agent outputs for context"""
        if not outputs:
            return ""
        
        formatted = ""
        for agent, output_data in outputs.items():
            formatted += f"### {agent.upper()} Output\\n"
            if isinstance(output_data, dict):
                formatted += f"{output_data.get('response', '')}\\n\\n"
            else:
                formatted += f"{output_data}\\n\\n"
        
        return formatted
    
    def _get_timestamp(self) -> str:
        # Returns current timestamp in standardized format for logging and file naming
        """Get current timestamp string"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

