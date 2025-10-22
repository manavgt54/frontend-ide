from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Boolean
from src.models.user import db

class MCPServer(db.Model):
    """SQLAlchemy model representing a configured MCP server and its CLI invocation details."""
    __tablename__ = 'mcp_servers'

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    command = Column(Text, nullable=False)
    args = Column(Text)  # JSON array of args
    env = Column(Text)   # JSON object of env vars
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'name': self.name,
            'command': self.command,
            'args': (lambda v: (json.loads(v) if v else []))(self.args),
            'env': (lambda v: (json.loads(v) if v else {}))(self.env),
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        } 