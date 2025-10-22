from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean
from src.models.user import db

class Workflow(db.Model):
    """SQLAlchemy model for workflows"""
    __tablename__ = 'workflows'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text)
    agent_sequence = Column(Text, nullable=False)  # JSON serialized list of agent names
    agent_models = Column(Text)  # JSON serialized list of model names aligned with agent_sequence
    agent_temperatures = Column(Text)  # JSON serialized list of temperatures aligned with agent_sequence
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), default='system')
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'agent_sequence': json.loads(self.agent_sequence) if self.agent_sequence else [],
            'agent_models': json.loads(self.agent_models) if getattr(self, 'agent_models', None) else [],
            'agent_temperatures': json.loads(self.agent_temperatures) if getattr(self, 'agent_temperatures', None) else [],
            'is_default': self.is_default,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by
        }
    
    @classmethod
    def get_default_workflow(cls):
        """Get the default workflow"""
        return cls.query.filter_by(is_default=True, is_active=True).first()
    
    @classmethod
    def get_active_workflows(cls):
        """Get all active workflows"""
        return cls.query.filter_by(is_active=True).order_by(cls.created_at.desc()).all()
