from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Integer
from src.models.user import db

class Task(db.Model):
    """SQLAlchemy model for tasks"""
    __tablename__ = 'tasks'
    
    id = Column(String(36), primary_key=True)
    user_prompt = Column(Text, nullable=False)
    status = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    project_path = Column(String(500))
    current_agent = Column(String(100))
    progress_percentage = Column(Integer, default=0)
    state_json = Column(Text)  # JSON serialized TaskState
    error_message = Column(Text)
    workflow_id = Column(String(36))
    memory_json = Column(Text)  # JSON serialized memory (history of prompts and agent progress)
    
    def to_dict(self):
        return {
            'task_id': self.id,
            'user_prompt': self.user_prompt,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'project_path': self.project_path,
            'current_agent': self.current_agent,
            'progress_percentage': self.progress_percentage,
            'error_message': self.error_message,
            'workflow_id': self.workflow_id
        } 