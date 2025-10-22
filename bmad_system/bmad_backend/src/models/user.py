"""
Database Initialization and User Model

Initializes SQLAlchemy and Alembic migrations for the Flask app and defines the
`User` model used by the simple CRUD routes.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
import os

# Initialize SQLAlchemy
db = SQLAlchemy()
migrate = Migrate()

def init_db(app):
    """Initialize the database with the Flask app"""
    # Configure database
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    
    # Import models to ensure they are registered
    from src.models.task import Task
    from src.models.workflow import Workflow
    from src.models.custom_agent import CustomAgent
    from src.models.mcp import MCPServer
    
    # Create tables
    with app.app_context():
        db.create_all()

        # Lightweight schema guard: ensure tasks.workflow_id exists
        try:
            from sqlalchemy import text as sa_text
            engine = db.engine
            with engine.connect() as conn:
                try:
                    result = conn.execute(sa_text("PRAGMA table_info(tasks)"))
                    cols = [row[1] for row in result]
                    if 'workflow_id' not in cols:
                        conn.execute(sa_text("ALTER TABLE tasks ADD COLUMN workflow_id VARCHAR(36)"))
                except Exception:
                    pass
        except Exception:
            pass
 
        # Lightweight schema guard: ensure workflows.agent_models exists
        try:
            from sqlalchemy import text as sa_text
            engine = db.engine
            with engine.connect() as conn:
                try:
                    result = conn.execute(sa_text("PRAGMA table_info(workflows)"))
                    cols = [row[1] for row in result]
                    if 'agent_models' not in cols:
                        conn.execute(sa_text("ALTER TABLE workflows ADD COLUMN agent_models TEXT"))
                    # New: ensure workflows.agent_temperatures exists
                    if 'agent_temperatures' not in cols:
                        conn.execute(sa_text("ALTER TABLE workflows ADD COLUMN agent_temperatures TEXT"))
                except Exception:
                    pass
        except Exception:
            pass
        
        # Initialize default workflow if none exists
        from src.models.workflow import Workflow
        if not Workflow.get_default_workflow():
            import json
            import uuid
            default_sequence = ["directory_structure", "orchestrator", "analyst", "architect", "pm", "sm", "developer", "devops", "tester"]
            default_workflow = Workflow(
                id=str(uuid.uuid4()),
                name="Default Adaptive System Workflow",
                description="Standard Adaptive System workflow with all agents",
                agent_sequence=json.dumps(default_sequence),
                agent_models=json.dumps([None] * len(default_sequence)),
                agent_temperatures=json.dumps([None] * len(default_sequence)),
                is_default=True,
                is_active=True,
                created_by='system'
            )
            db.session.add(default_workflow)
            db.session.commit()

class User(db.Model):
    """SQLAlchemy model for application users."""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    def __repr__(self):
        return f'<User {self.username}>'

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email
        }
