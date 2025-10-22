"""
Adaptive System Backend Application Entrypoint

This module initializes the Flask app, configures CORS, registers API blueprints,
initializes the database, and serves the built frontend static assets.
"""
import os
import sys
# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory
from flask_cors import CORS
from src.models.user import db, init_db
from src.models.task import Task  # Import Task model
from src.models.workflow import Workflow  # Import Workflow model
from src.models.custom_agent import CustomAgent  # Import CustomAgent model
from src.routes.user import user_bp
from src.routes.adaptive_system_api import adaptive_system_bp
from src.utils.logger import setup_logging

# Initialize logging
setup_logging()

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'

# Enable CORS for all routes
CORS(app, origins="*")

# Register blueprints
app.register_blueprint(user_bp, url_prefix='/api')
app.register_blueprint(adaptive_system_bp)

# Initialize database with all models
init_db(app)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """Serve static frontend files and fall back to index.html for SPA routes."""
    static_folder_path = app.static_folder
    if static_folder_path is None:
            return "Static folder not configured", 404

    if path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        index_path = os.path.join(static_folder_path, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder_path, 'index.html')
        else:
            return "index.html not found", 404

@app.route('/api/status')
def api_status():
    """API status endpoint"""
    return {
        'status': 'running',
        'message': 'Adaptive System API is operational',
        'version': '1.0.0'
    }

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
