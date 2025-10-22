"""
Project Executor Module for Adaptive System

This module handles the execution phase after all agents have completed their analysis.
It reads agent outputs and generates the actual project files, builds the project,
and provides deployment instructions.
"""

import os
import json
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from src.utils.logger import get_logger

logger = get_logger(__name__)

class ProjectExecutor:
    """Executes project generation based on agent outputs"""
    
    def __init__(self):
        self.project_templates = {
            'web_app': {
                'frontend': ['html', 'css', 'js'],
                'backend': ['python', 'nodejs', 'php'],
                'database': ['sqlite', 'postgresql', 'mongodb']
            },
            'mobile_app': {
                'platform': ['react_native', 'flutter', 'native_ios', 'native_android']
            },
            'desktop_app': {
                'framework': ['electron', 'tkinter', 'pyqt', 'wxpython']
            }
        }
    
    def execute_project_generation(self, task_id: str, agent_outputs: Dict[str, str]) -> Dict[str, Any]:
        """
        Execute project generation based on agent outputs
        
        Args:
            task_id: Task identifier
            agent_outputs: Dictionary of agent outputs
            
        Returns:
            Execution results with generated files and instructions
        """
        try:
            logger.info(f"[START] Starting project execution for task {task_id}")
            
            # Parse agent outputs to understand project requirements
            project_spec = self._parse_agent_outputs(agent_outputs)
            
            # Generate project structure
            project_structure = self._generate_project_structure(project_spec)
            
            # Create actual project files
            generated_files = self._create_project_files(task_id, project_structure, project_spec)
            
            # Generate build and deployment instructions
            deployment_guide = self._generate_deployment_guide(project_spec, generated_files)
            
            # Create project summary
            project_summary = self._create_project_summary(task_id, project_spec, generated_files)
            
            logger.info(f"✅ Project execution completed for task {task_id}")
            
            return {
                'status': 'completed',
                'task_id': task_id,
                'project_spec': project_spec,
                'generated_files': generated_files,
                'deployment_guide': deployment_guide,
                'project_summary': project_summary,
                'execution_time': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Project execution failed for task {task_id}: {e}")
            return {
                'status': 'failed',
                'task_id': task_id,
                'error': str(e),
                'execution_time': datetime.now().isoformat()
            }
    
    def _parse_agent_outputs(self, agent_outputs: Dict[str, str]) -> Dict[str, Any]:
        # Extracts project specifications from agent outputs for file generation
        """Parse agent outputs to extract project specifications"""
        project_spec = {
            'project_type': 'web_app',  # Default
            'name': 'Adaptive System Project',
            'description': '',
            'features': [],
            'tech_stack': {
                'frontend': 'html/css/js',
                'backend': 'python',
                'database': 'sqlite'
            },
            'requirements': [],
            'architecture': {},
            'deployment': {}
        }
        
        # Parse Adaptive System Master output for project overview
        if 'orchestrator' in agent_outputs:
            orchestrator_output = agent_outputs['orchestrator']
            project_spec['description'] = self._extract_description(orchestrator_output)
            project_spec['name'] = self._extract_project_name(orchestrator_output)
        
        # Parse Analyst output for requirements
        if 'analyst' in agent_outputs:
            analyst_output = agent_outputs['analyst']
            project_spec['requirements'] = self._extract_requirements(analyst_output)
            project_spec['features'] = self._extract_features(analyst_output)
        
        # Parse Architect output for architecture
        if 'architect' in agent_outputs:
            architect_output = agent_outputs['architect']
            project_spec['architecture'] = self._extract_architecture(architect_output)
            project_spec['tech_stack'] = self._extract_tech_stack(architect_output)
        
        # Parse Developer output for implementation details
        if 'developer' in agent_outputs:
            developer_output = agent_outputs['developer']
            project_spec['implementation'] = self._extract_implementation(developer_output)
        
        # Parse DevOps output for deployment
        if 'devops' in agent_outputs:
            devops_output = agent_outputs['devops']
            project_spec['deployment'] = self._extract_deployment(devops_output)
        
        # Parse PM output for project management
        if 'pm' in agent_outputs:
            pm_output = agent_outputs['pm']
            project_spec['timeline'] = self._extract_timeline(pm_output)
        
        return project_spec
    
    def _extract_description(self, text: str) -> str:
        # Uses regex patterns to extract project description from text
        """Extract project description from text"""
        # Look for description patterns
        patterns = [
            r'description[:\s]+([^.\n]+)',
            r'project[:\s]+([^.\n]+)',
            r'create[:\s]+([^.\n]+)',
            r'build[:\s]+([^.\n]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return "A Adaptive System-generated project"
    
    def _extract_project_name(self, text: str) -> str:
        # Extracts project name using regex patterns and cleans formatting
        """Extract project name from text"""
        # Look for app names
        patterns = [
            r'(?:create|build)\s+(?:a\s+)?([a-zA-Z0-9\s-]+?)(?:\s+app|\s+application|\s+system)',
            r'([a-zA-Z0-9\s-]+?)\s+(?:app|application|system)',
            r'project[:\s]+([a-zA-Z0-9\s-]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                name = match.group(1).strip()
                # Clean up the name
                name = re.sub(r'\s+', '-', name).lower()
                return name
        
        return "adaptive-system-project"
    
    def _extract_requirements(self, text: str) -> List[str]:
        # Parses numbered or bulleted requirements from analyst output
        """Extract requirements from analyst output"""
        requirements = []
        
        # Look for numbered or bulleted requirements
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if re.match(r'^[\d\-*]\s+', line):
                requirement = re.sub(r'^[\d\-*]\s+', '', line)
                if requirement:
                    requirements.append(requirement)
        
        return requirements
    
    def _extract_features(self, text: str) -> List[str]:
        """Extract features from analyst output"""
        features = []
        
        # Look for feature mentions
        feature_patterns = [
            r'feature[:\s]+([^.\n]+)',
            r'functionality[:\s]+([^.\n]+)',
            r'capability[:\s]+([^.\n]+)'
        ]
        
        for pattern in feature_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            features.extend(matches)
        
        return features
    
    def _extract_architecture(self, text: str) -> Dict[str, Any]:
        """Extract architecture information from architect output"""
        architecture = {
            'pattern': 'mvc',
            'layers': [],
            'components': []
        }
        
        # Look for architecture patterns
        if 'mvc' in text.lower():
            architecture['pattern'] = 'mvc'
        elif 'microservices' in text.lower():
            architecture['pattern'] = 'microservices'
        elif 'monolithic' in text.lower():
            architecture['pattern'] = 'monolithic'
        
        return architecture
    
    def _extract_tech_stack(self, text: str) -> Dict[str, str]:
        """Extract technology stack from architect output"""
        tech_stack = {
            'frontend': 'html/css/js',
            'backend': 'python',
            'database': 'sqlite'
        }
        
        # Look for technology mentions
        if 'react' in text.lower():
            tech_stack['frontend'] = 'react'
        elif 'vue' in text.lower():
            tech_stack['frontend'] = 'vue'
        elif 'angular' in text.lower():
            tech_stack['frontend'] = 'angular'
        
        if 'node' in text.lower() or 'express' in text.lower():
            tech_stack['backend'] = 'nodejs'
        elif 'django' in text.lower():
            tech_stack['backend'] = 'django'
        elif 'flask' in text.lower():
            tech_stack['backend'] = 'flask'
        
        if 'postgres' in text.lower():
            tech_stack['database'] = 'postgresql'
        elif 'mysql' in text.lower():
            tech_stack['database'] = 'mysql'
        elif 'mongodb' in text.lower():
            tech_stack['database'] = 'mongodb'
        
        return tech_stack
    
    def _extract_implementation(self, text: str) -> Dict[str, Any]:
        """Extract implementation details from developer output"""
        implementation = {
            'libraries': [],
            'frameworks': [],
            'code_structure': {}
        }
        
        # Extract mentioned libraries and frameworks
        lines = text.split('\n')
        for line in lines:
            line = line.lower()
            if any(lib in line for lib in ['library', 'package', 'framework', 'tool']):
                # Extract library names
                words = line.split()
                for word in words:
                    if word not in ['library', 'package', 'framework', 'tool', 'use', 'using']:
                        implementation['libraries'].append(word)
        
        return implementation
    
    def _extract_deployment(self, text: str) -> Dict[str, Any]:
        """Extract deployment information from devops output"""
        deployment = {
            'platform': 'local',
            'requirements': [],
            'commands': []
        }
        
        # Look for deployment platforms
        if 'docker' in text.lower():
            deployment['platform'] = 'docker'
        elif 'heroku' in text.lower():
            deployment['platform'] = 'heroku'
        elif 'aws' in text.lower():
            deployment['platform'] = 'aws'
        elif 'azure' in text.lower():
            deployment['platform'] = 'azure'
        
        return deployment
    
    def _extract_timeline(self, text: str) -> Dict[str, Any]:
        """Extract timeline information from PM output"""
        timeline = {
            'phases': [],
            'milestones': [],
            'duration': '1-2 weeks'
        }
        
        return timeline
    
    def _generate_project_structure(self, project_spec: Dict[str, Any]) -> Dict[str, Any]:
        """Generate project structure based on specifications"""
        structure = {
            'root': project_spec['name'],
            'directories': [],
            'files': []
        }
        
        # Add common directories
        structure['directories'] = [
            'src',
            'docs',
            'tests',
            'config',
            'static',
            'templates'
        ]
        
        # Add files based on tech stack
        tech_stack = project_spec['tech_stack']
        
        if tech_stack['frontend'] in ['html/css/js', 'react', 'vue', 'angular']:
            structure['files'].extend([
                'index.html',
                'styles.css',
                'script.js',
                'package.json'
            ])
        
        if tech_stack['backend'] in ['python', 'django', 'flask']:
            structure['files'].extend([
                'main.py',
                'requirements.txt',
                'app.py'
            ])
        
        structure['files'].extend([
            'README.md',
            '.gitignore',
            'config.json'
        ])
        
        return structure
    
    def _create_project_files(self, task_id: str, structure: Dict[str, Any], spec: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create actual project files"""
        generated_files = []
        import tempfile
        project_dir = os.path.join(tempfile.gettempdir(), "adaptive_system_projects", task_id)
        os.makedirs(project_dir, exist_ok=True)
        
        # Create README.md
        readme_content = self._generate_readme(spec)
        readme_path = os.path.join(project_dir, 'README.md')
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(readme_content)
        generated_files.append({
            'path': 'README.md',
            'type': 'documentation',
            'content_preview': readme_content[:200] + '...'
        })
        
        # Create main application file
        if spec['tech_stack']['backend'] == 'python':
            app_content = self._generate_python_app(spec)
            app_path = os.path.join(project_dir, 'app.py')
            with open(app_path, 'w', encoding='utf-8') as f:
                f.write(app_content)
            generated_files.append({
                'path': 'app.py',
                'type': 'backend',
                'content_preview': app_content[:200] + '...'
            })
        
        # Create frontend files
        if spec['tech_stack']['frontend'] == 'html/css/js':
            html_content = self._generate_html(spec)
            html_path = os.path.join(project_dir, 'index.html')
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            generated_files.append({
                'path': 'index.html',
                'type': 'frontend',
                'content_preview': html_content[:200] + '...'
            })
            
            css_content = self._generate_css(spec)
            css_path = os.path.join(project_dir, 'styles.css')
            with open(css_path, 'w', encoding='utf-8') as f:
                f.write(css_content)
            generated_files.append({
                'path': 'styles.css',
                'type': 'frontend',
                'content_preview': css_content[:200] + '...'
            })
            
            js_content = self._generate_javascript(spec)
            js_path = os.path.join(project_dir, 'script.js')
            with open(js_path, 'w', encoding='utf-8') as f:
                f.write(js_content)
            generated_files.append({
                'path': 'script.js',
                'type': 'frontend',
                'content_preview': js_content[:200] + '...'
            })
        
        # Create configuration files
        config_content = self._generate_config(spec)
        config_path = os.path.join(project_dir, 'config.json')
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(config_content)
        generated_files.append({
            'path': 'config.json',
            'type': 'configuration',
            'content_preview': config_content[:200] + '...'
        })
        
        return generated_files
    
    def _generate_readme(self, spec: Dict[str, Any]) -> str:
        """Generate README.md content"""
        return f"""# {spec['name'].title()}

{spec['description']}

## Features

{chr(10).join([f"- {feature}" for feature in spec['features']])}

## Requirements

{chr(10).join([f"- {req}" for req in spec['requirements']])}

## Tech Stack

- **Frontend**: {spec['tech_stack']['frontend']}
- **Backend**: {spec['tech_stack']['backend']}
- **Database**: {spec['tech_stack']['database']}

## Installation

1. Clone the repository
2. Install dependencies
3. Run the application

## Usage

Follow the deployment guide for detailed instructions.

## License

MIT License
"""
    
    def _generate_python_app(self, spec: Dict[str, Any]) -> str:
        """Generate Python application file"""
        return f"""#!/usr/bin/env python3
\"\"\"
{spec['name'].title()} - {spec['description']}
Generated by Adaptive System
\"\"\"

from flask import Flask, render_template, request, jsonify
import sqlite3
import json
from datetime import datetime

app = Flask(__name__)

# Database initialization
def init_db():
    conn = sqlite3.connect('{spec["name"]}.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            completed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/items', methods=['GET'])
def get_items():
    conn = sqlite3.connect('{spec["name"]}.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM items ORDER BY created_at DESC')
    items = cursor.fetchall()
    conn.close()
    
    return jsonify([{{
        'id': item[0],
        'title': item[1],
        'description': item[2],
        'completed': bool(item[3]),
        'created_at': item[4]
    }} for item in items])

@app.route('/api/items', methods=['POST'])
def create_item():
    data = request.get_json()
    title = data.get('title', '')
    description = data.get('description', '')
    
    conn = sqlite3.connect('{spec["name"]}.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO items (title, description) VALUES (?, ?)', (title, description))
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    
    return jsonify({{'id': item_id, 'title': title, 'description': description, 'completed': False}})

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    
    conn = sqlite3.connect('{spec["name"]}.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE items SET title=?, description=?, completed=? WHERE id=?',
                   (data.get('title'), data.get('description'), data.get('completed', False), item_id))
    conn.commit()
    conn.close()
    
    return jsonify({{'message': 'Item updated successfully'}})

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    conn = sqlite3.connect('{spec["name"]}.db')
    cursor = conn.cursor()
    cursor.execute('DELETE FROM items WHERE id=?', (item_id,))
    conn.commit()
    conn.close()
    
    return jsonify({{'message': 'Item deleted successfully'}})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
"""
    
    def _generate_html(self, spec: Dict[str, Any]) -> str:
        """Generate HTML file"""
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{spec['name'].title()}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>{spec['name'].title()}</h1>
            <p>{spec['description']}</p>
        </header>
        
        <main>
            <div class="add-item-form">
                <input type="text" id="itemTitle" placeholder="Enter item title...">
                <textarea id="itemDescription" placeholder="Enter description (optional)"></textarea>
                <button onclick="addItem()">Add Item</button>
            </div>
            
            <div class="items-list" id="itemsList">
                <!-- Items will be loaded here -->
            </div>
        </main>
    </div>
    
    <script src="script.js"></script>
</body>
</html>"""
    
    def _generate_css(self, spec: Dict[str, Any]) -> str:
        """Generate CSS file"""
        return """* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    overflow: hidden;
}

header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    text-align: center;
}

header h1 {
    font-size: 2.5rem;
    margin-bottom: 10px;
}

.add-item-form {
    padding: 30px;
    border-bottom: 1px solid #eee;
}

.add-item-form input,
.add-item-form textarea {
    width: 100%;
    padding: 15px;
    margin-bottom: 15px;
    border: 2px solid #eee;
    border-radius: 8px;
    font-size: 16px;
    transition: border-color 0.3s;
}

.add-item-form input:focus,
.add-item-form textarea:focus {
    outline: none;
    border-color: #667eea;
}

.add-item-form button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.2s;
}

.add-item-form button:hover {
    transform: translateY(-2px);
}

.items-list {
    padding: 30px;
}

.item {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 15px;
    border-left: 4px solid #667eea;
    transition: transform 0.2s;
}

.item:hover {
    transform: translateX(5px);
}

.item.completed {
    opacity: 0.7;
    border-left-color: #28a745;
}

.item h3 {
    color: #333;
    margin-bottom: 10px;
}

.item p {
    color: #666;
    margin-bottom: 15px;
}

.item-actions {
    display: flex;
    gap: 10px;
}

.item-actions button {
    padding: 8px 15px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.complete-btn {
    background: #28a745;
    color: white;
}

.complete-btn:hover {
    background: #218838;
}

.delete-btn {
    background: #dc3545;
    color: white;
}

.delete-btn:hover {
    background: #c82333;
}

.edit-btn {
    background: #ffc107;
    color: #212529;
}

.edit-btn:hover {
    background: #e0a800;
}"""
    
    def _generate_javascript(self, spec: Dict[str, Any]) -> str:
        """Generate JavaScript file"""
        return f"""// {spec['name'].title()} - Frontend JavaScript
// Generated by Adaptive System

class TodoApp {
    constructor() {
        this.items = [];
        this.init();
    }
    
    async init() {
        await this.loadItems();
        this.setupEventListeners();
    }
    
    async loadItems() {
        try {
            const response = await fetch('/api/items');
            this.items = await response.json();
            this.renderItems();
        } catch (error) {
            console.error('Error loading items:', error);
        }
    }
    
    async addItem(title, description = '') {
        try {
            const response = await fetch('/api/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title, description })
            });
            
            const newItem = await response.json();
            this.items.unshift(newItem);
            this.renderItems();
            this.clearForm();
        } catch (error) {
            console.error('Error adding item:', error);
        }
    }
    
    async updateItem(id, updates) {
        try {
            const response = await fetch(`/api/items/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates)
            });
            
            await response.json();
            await this.loadItems();
        } catch (error) {
            console.error('Error updating item:', error);
        }
    }
    
    async deleteItem(id) {
        try {
            const response = await fetch(`/api/items/${id}`, {
                method: 'DELETE'
            });
            
            await response.json();
            this.items = this.items.filter(item => item.id !== id);
            this.renderItems();
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    }
    
    renderItems() {
        const itemsList = document.getElementById('itemsList');
        itemsList.innerHTML = '';
        
        this.items.forEach(item => {
            const itemElement = this.createItemElement(item);
            itemsList.appendChild(itemElement);
        });
    }
    
    createItemElement(item) {
        const div = document.createElement('div');
        div.className = `item ${item.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <h3>${item.title}</h3>
            <p>${item.description || 'No description'}</p>
            <div class="item-actions">
                <button class="complete-btn" onclick="todoApp.toggleComplete(${item.id}, ${!item.completed})">
                    ${item.completed ? 'Undo' : 'Complete'}
                </button>
                <button class="edit-btn" onclick="todoApp.editItem(${item.id})">Edit</button>
                <button class="delete-btn" onclick="todoApp.deleteItem(${item.id})">Delete</button>
            </div>
        `;
        return div;
    }
    
    async toggleComplete(id, completed) {
        await this.updateItem(id, { completed });
    }
    
    editItem(id) {
        const item = this.items.find(item => item.id === id);
        if (item) {
            document.getElementById('itemTitle').value = item.title;
            document.getElementById('itemDescription').value = item.description || '';
            // You could implement a more sophisticated edit mode here
        }
    }
    
    clearForm() {
        document.getElementById('itemTitle').value = '';
        document.getElementById('itemDescription').value = '';
    }
    
    setupEventListeners() {
        // Add any additional event listeners here
    }
}

// Initialize the app
const todoApp = new TodoApp();

// Global function for the add button
function addItem() {
    const title = document.getElementById('itemTitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    
    if (title) {
        todoApp.addItem(title, description);
    }
}"""
    
    def _generate_config(self, spec: Dict[str, Any]) -> str:
        """Generate configuration file"""
        config = {
            'project': {
                'name': spec['name'],
                'description': spec['description'],
                'version': '1.0.0',
                'author': 'Adaptive System',
                'generated_at': datetime.now().isoformat()
            },
            'tech_stack': spec['tech_stack'],
            'features': spec['features'],
            'requirements': spec['requirements'],
            'deployment': spec['deployment']
        }
        
        return json.dumps(config, indent=2)
    
    def _generate_deployment_guide(self, spec: Dict[str, Any], files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate deployment guide"""
        return {
            'title': f"Deployment Guide for {spec['name'].title()}",
            'steps': [
                {
                    'step': 1,
                    'title': 'Prerequisites',
                    'description': 'Install required dependencies',
                    'commands': [
                        'pip install flask',
                        'pip install sqlite3'
                    ]
                },
                {
                    'step': 2,
                    'title': 'Setup',
                    'description': 'Initialize the project',
                    'commands': [
                        'python app.py'
                    ]
                },
                {
                    'step': 3,
                    'title': 'Access',
                    'description': 'Open your browser and navigate to',
                    'url': 'http://localhost:5000'
                }
            ],
            'platform': spec['deployment'].get('platform', 'local'),
            'requirements': spec['requirements']
        }
    
    def _create_project_summary(self, task_id: str, spec: Dict[str, Any], files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create project summary"""
        return {
            'task_id': task_id,
            'project_name': spec['name'],
            'description': spec['description'],
            'files_generated': len(files),
            'tech_stack': spec['tech_stack'],
            'features_count': len(spec['features']),
            'requirements_count': len(spec['requirements']),
            'generation_time': datetime.now().isoformat(),
            'status': 'ready_for_deployment'
        } 