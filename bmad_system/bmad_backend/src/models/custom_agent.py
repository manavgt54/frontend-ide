from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean
from src.models.user import db

class CustomAgent(db.Model):
    """SQLAlchemy model for custom agents"""
    __tablename__ = 'custom_agents'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text)
    prompt = Column(Text, nullable=False)
    instructions = Column(Text)  # Specific instructions for the agent
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), default='user')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'description': self.description,
            'prompt': self.prompt,
            'instructions': self.instructions,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'is_custom': True
        }
    
    @classmethod
    def get_active_custom_agents(cls):
        """Get all active custom agents"""
        return cls.query.filter_by(is_active=True).order_by(cls.created_at.desc()).all()
    
    @classmethod
    def get_custom_agent_by_name(cls, name):
        """Get a custom agent by name"""
        return cls.query.filter_by(name=name, is_active=True).first()
