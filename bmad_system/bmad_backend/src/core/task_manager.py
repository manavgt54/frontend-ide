"""
Task Manager Module for Adaptive System

This module manages the lifecycle of tasks, including creation, status tracking,
pausing, resuming, and persistence. It interacts with the SQLite database for
state management.
"""

import json
import os
import re
import tempfile
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass, asdict
from src.models.user import db
from src.models.task import Task
from sqlalchemy import text

class TaskStatus(Enum):
    RECEIVED = "received"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class TaskState:
    """Represents the current state of a task"""
    current_task_id: str
    completed_tasks: List[str]
    agent_sequence_index: int
    debug_attempts: int
    current_agent: str
    progress_percentage: float
    context: Dict[str, Any]

class TaskManager:
    """Manages task lifecycle and state persistence"""
    
    def __init__(self):
        base_tmp = tempfile.gettempdir()
        self.output_directory = os.path.join(base_tmp, "adaptive_system_output")
        os.makedirs(self.output_directory, exist_ok=True)
        # Ensure DB schema has required columns without full migrations (SQLite-safe)
        try:
            engine = db.engine
            with engine.connect() as conn:
                try:
                    result = conn.execute(text("PRAGMA table_info(tasks)"))
                    cols = [row[1] for row in result]
                    if 'workflow_id' not in cols:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN workflow_id VARCHAR(36)"))
                    if 'memory_json' not in cols:
                        conn.execute(text("ALTER TABLE tasks ADD COLUMN memory_json TEXT"))
                except Exception:
                    # Ignore if PRAGMA not supported or table missing; created elsewhere
                    pass
        except Exception:
            # DB might not be initialized yet; ignore
            pass
    
    def create_task(self, prompt: str, files: List[str] = None, metadata: Dict[str, Any] = None) -> str:
        """
        Create a new task and return the task ID
        
        Args:
            prompt: The user's input prompt
            files: List of uploaded files
            metadata: Additional task metadata (custom workflow, agent prompts, etc.)
            
        Returns:
            Task ID string
        """
        task_id = str(uuid.uuid4())
        
        # Create project directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        first_three_words = "_".join(prompt.split()[:3]).lower()
        # Sanitize for Windows and cross-platform safety: remove invalid filename chars
        first_three_words = re.sub(r"[<>:\\/|?*\r\n\t]", "_", first_three_words)
        first_three_words = re.sub(r"\s+", "_", first_three_words).strip("._ ")
        if not first_three_words:
            first_three_words = "project"
        project_name = f"{first_three_words}_{timestamp}"
        project_path = os.path.join(self.output_directory, project_name)
        os.makedirs(project_path, exist_ok=True)
        
        # Create enhanced directory structure
        self._create_project_directory_structure(project_path)
        
        # Create .io8project directory
        io8_project_path = os.path.join(project_path, ".io8project")
        os.makedirs(io8_project_path, exist_ok=True)
        
        # Initialize task state
        initial_state = TaskState(
            current_task_id=task_id,
            completed_tasks=[],
            agent_sequence_index=0,
            debug_attempts=0,
            current_agent="architect",
            progress_percentage=0.0,
            context={
                "uploaded_files": files or [],
                "project_path": project_path,
                "io8_project_path": io8_project_path
            }
        )
        
        # Initialize memory: seed with first user prompt entry
        initial_memory = {
            "history": [
                {
                    "timestamp": datetime.utcnow().isoformat(),
                    "prompt": prompt,
                    "workflow_id": metadata.get('workflow_id') if isinstance(metadata, dict) else None,
                    "agents_progress": {"completed": [], "remaining": []},
                    "agents_details": {}
                }
            ]
        }
        
        # Save to database
        task = Task(
            id=task_id,
            user_prompt=prompt,
            status=TaskStatus.RECEIVED.value,
            project_path=project_path,
            current_agent="architect",
            progress_percentage=0,
            state_json=json.dumps(asdict(initial_state)),
            memory_json=json.dumps(initial_memory)
        )
        
        db.session.add(task)
        db.session.commit()
        
        # Save state to project directory
        self._save_state_to_project(project_path, initial_state)
        
        return task_id
    
    def _create_project_directory_structure(self, project_path: str):
        # Creates standard project directory structure with .io8project and .sureai folders
        """Create the complete project directory structure"""
        directories = [
            os.path.join(project_path, ".io8project"),
            os.path.join(project_path, ".sureai"),
            os.path.join(project_path, ".sureai", "uploads"),
        ]
        
        for directory in directories:
            os.makedirs(directory, exist_ok=True)
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task information by ID"""
        task = Task.query.get(task_id)
        if task:
            return task.to_dict()
        return None
    
    def update_task_status(self, task_id: str, status: TaskStatus, 
                          current_agent: str = None, progress: float = None,
                          error_message: str = None) -> bool:
        """Update task status and related information"""
        task = Task.query.get(task_id)
        if not task:
            return False
        
        task.status = status.value
        task.updated_at = datetime.utcnow()
        
        if current_agent:
            task.current_agent = current_agent
        if progress is not None:
            task.progress_percentage = int(progress)
        if error_message:
            task.error_message = error_message
        
        db.session.commit()
        return True
    
    def update_task_progress(self, task_id: str, current_agent: str, progress: float) -> bool:
        """Update task progress and current agent"""
        task = Task.query.get(task_id)
        if not task:
            return False
        
        task.current_agent = current_agent
        task.progress_percentage = int(progress)
        task.updated_at = datetime.utcnow()
        
        db.session.commit()
        return True
    
    def pause_task(self, task_id: str) -> bool:
        """Pause a running task"""
        return self.update_task_status(task_id, TaskStatus.PAUSED)
    
    def resume_task(self, task_id: str) -> bool:
        """Resume a paused task"""
        return self.update_task_status(task_id, TaskStatus.IN_PROGRESS)
    
    def cancel_task(self, task_id: str) -> bool:
        """Cancel a task"""
        return self.update_task_status(task_id, TaskStatus.CANCELLED)
    
    def get_task_state(self, task_id: str) -> Optional[TaskState]:
        """Get the current state of a task"""
        task = Task.query.get(task_id)
        if not task or not task.state_json:
            return None
        
        try:
            state_dict = json.loads(task.state_json)
            return TaskState(**state_dict)
        except (json.JSONDecodeError, TypeError):
            return None
    
    def update_task_state(self, task_id: str, state: TaskState) -> bool:
        """Update the task state"""
        task = Task.query.get(task_id)
        if not task:
            return False
        
        task.state_json = json.dumps(asdict(state))
        task.current_agent = state.current_agent
        task.progress_percentage = int(state.progress_percentage)
        task.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        # Also save to project directory
        if task.project_path:
            self._save_state_to_project(task.project_path, state)
        
        return True
    
    def _save_state_to_project(self, project_path: str, state: TaskState):
        # Persists task state to .state.json file in project directory for recovery
        """Save state to .state.json in project directory"""
        state_file = os.path.join(project_path, ".io8project", ".state.json")
        with open(state_file, 'w') as f:
            json.dump(asdict(state), f, indent=2)
    
    def load_state_from_project(self, project_path: str) -> Optional[TaskState]:
        # Loads task state from .state.json file in project directory for recovery
        """Load state from .state.json in project directory"""
        state_file = os.path.join(project_path, ".io8project", ".state.json")
        if not os.path.exists(state_file):
            return None
        
        try:
            with open(state_file, 'r') as f:
                state_dict = json.load(f)
            return TaskState(**state_dict)
        except (json.JSONDecodeError, FileNotFoundError, TypeError):
            return None
    
    def list_tasks(self, limit: int = 50) -> List[Dict[str, Any]]:
        """List all tasks with pagination"""
        tasks = Task.query.order_by(Task.created_at.desc()).limit(limit).all()
        return [task.to_dict() for task in tasks]
    
    def get_active_tasks(self) -> List[Dict[str, Any]]:
        """Get all active (in-progress) tasks"""
        tasks = Task.query.filter(
            Task.status.in_([TaskStatus.IN_PROGRESS.value, TaskStatus.RECEIVED.value])
        ).all()
        return [task.to_dict() for task in tasks]
    
    def get_all_tasks(self) -> List[Dict[str, Any]]:
        """Get all tasks"""
        tasks = Task.query.order_by(Task.created_at.desc()).all()
        return [task.to_dict() for task in tasks]
    
    def get_task_output_directory(self, task_id: str) -> Optional[str]:
        """Get the output directory for a task"""
        task = Task.query.get(task_id)
        if task and task.project_path:
            return task.project_path
        return None
    
    # ----- Memory helpers -----
    def get_task_memory(self, task_id: str) -> Dict[str, Any]:
        # Retrieves task memory from database including history and agent progress
        task = Task.query.get(task_id)
        if not task:
            return {"history": []}
        try:
            if task.memory_json:
                return json.loads(task.memory_json)
        except Exception:
            pass
        return {"history": []}
    
    def append_memory_entry(self, task_id: str, prompt: str, workflow_id: Optional[str], agents_completed: List[str], agents_remaining: List[str]) -> bool:
        # Adds new memory entry to task history with agent progress tracking
        task = Task.query.get(task_id)
        if not task:
            return False
        mem = self.get_task_memory(task_id)
        mem.setdefault("history", []).append({
            "timestamp": datetime.utcnow().isoformat(),
            "prompt": prompt,
            "workflow_id": workflow_id,
            "agents_progress": {"completed": agents_completed, "remaining": agents_remaining},
            "agents_details": {}
        })
        task.memory_json = json.dumps(mem)
        task.updated_at = datetime.utcnow()
        db.session.commit()
        return True
    
    def update_latest_memory_progress(self, task_id: str, agents_completed: List[str], agents_remaining: List[str]) -> bool:
        # Updates the latest memory entry with current agent progress status
        task = Task.query.get(task_id)
        if not task:
            return False
        mem = self.get_task_memory(task_id)
        history = mem.setdefault("history", [])
        if not history:
            return False
        history[-1]["agents_progress"] = {"completed": agents_completed, "remaining": agents_remaining}
        task.memory_json = json.dumps(mem)
        task.updated_at = datetime.utcnow()
        db.session.commit()
        return True
    
    def update_agent_artifacts(self, task_id: str, agent_name: str, files_created: List[str]) -> bool:
        # Updates latest history with per-agent files and computes in-progress file hint
        """Update latest history with per-agent files and compute in-progress file hint."""
        task = Task.query.get(task_id)
        if not task:
            return False
        mem = self.get_task_memory(task_id)
        history = mem.setdefault("history", [])
        if not history:
            return False
        entry = history[-1]
        agents_details = entry.setdefault("agents_details", {})
        details = agents_details.setdefault(agent_name, {})
        
        # Filter artifacts by agent-known outputs to avoid cross-attribution
        agent_outputs: Dict[str, List[str]] = {
            "orchestrator": [".sureai/.orchestrator_breakdown.md", ".sureai/.orchestrator_plan.md"],
            "analyst": [".sureai/analysis_document.md", ".sureai/requirements_document.md"],
            "architect": [".sureai/architecture_document.md", ".sureai/tech_stack_document.md"],
            "pm": [".sureai/prd_document.md", ".sureai/project_plan.md"],
            "sm": [".sureai/tasks_list.md", ".sureai/sprint_plan.md"],
            "developer": [".sureai/tasks_list.md", "backend/", "frontend/"],
            "devops": ["deployment_config.yml", "Dockerfile.backend", "Dockerfile.frontend", "docker-compose.yml", "nginx.conf"],
            "tester": [".sureai/test-list.md"],
            "directory_structure": ["frontend", "backend", ".io8project", ".sureai"],
        }
        allowed = agent_outputs.get(agent_name, [])
        filtered: List[str] = []
        for p in files_created or []:
            norm = p.replace('\\', '/')
            # keep exact path if it matches or is under allowed dir prefix
            if any(norm == a or norm.startswith(a) for a in allowed) or not allowed:
                filtered.append(norm)
        
        details["files_created"] = filtered
        details["last_updated"] = datetime.utcnow().isoformat()
        
        # Heuristic to choose in-progress file
        in_progress = None
        # Prefer .md under .sureai
        md_files = [
            f for f in filtered
            if (f.endswith('.md') and (f.startswith('.sureai/') or '/.sureai/' in f))
        ]
        if agent_name in ["developer", "sm"]:
            # Prefer tasks_list.md
            for f in filtered:
                if f.endswith('tasks_list.md'):
                    in_progress = f
                    break
        if agent_name == "tester" and not in_progress:
            for f in filtered:
                if f.endswith('test-list.md'):
                    in_progress = f
                    break
        if not in_progress and md_files:
            in_progress = md_files[0]
        # Avoid directories as in-progress file (no dot suggests directory)
        if in_progress and ("/" not in in_progress and "." not in in_progress):
            in_progress = None
        details["in_progress_file"] = in_progress
        agents_details[agent_name] = details
        entry["agents_details"] = agents_details
        task.memory_json = json.dumps(mem)
        task.updated_at = datetime.utcnow()
        db.session.commit()
        return True
    
    def update_latest_memory_error(self, task_id: str, agent_name: str, code: str, message: str) -> bool:
        # Records an error for the latest run in memory for debugging and recovery
        """Record an error for the latest run in memory."""
        task = Task.query.get(task_id)
        if not task:
            return False
        mem = self.get_task_memory(task_id)
        history = mem.setdefault("history", [])
        if not history:
            return False
        entry = history[-1]
        entry["error"] = {
            "timestamp": datetime.utcnow().isoformat(),
            "agent": agent_name,
            "code": code,
            "message": message
        }
        task.memory_json = json.dumps(mem)
        task.updated_at = datetime.utcnow()
        db.session.commit()
        return True

