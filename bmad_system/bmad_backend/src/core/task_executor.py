"""
Task Executor Module for Adaptive System

This module handles the execution of actual tasks based on agent outputs.
It creates working files (not just .md files) that subsequent agents can use.
"""

import os
import json
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from src.utils.logger import get_logger

logger = get_logger(__name__)

class TaskExecutor:
    """Executes actual tasks based on agent outputs"""
    
    def __init__(self):
        self.task_templates = {
            'analyst': {
                'outputs': ['.tasks', '.prd'],
                'executor': self._execute_analyst_tasks
            },
            'architect': {
                'outputs': ['.architecture', '.tech-stack'],
                'executor': self._execute_architect_tasks
            },
            'developer': {
                'outputs': ['.code', '.implementation'],
                'executor': self._execute_developer_tasks
            },
            'devops': {
                'outputs': ['.deployment', '.infrastructure'],
                'executor': self._execute_devops_tasks
            },
            'pm': {
                'outputs': ['.timeline', '.milestones'],
                'executor': self._execute_pm_tasks
            }
        }
    
    def execute_agent_tasks(self, task_id: str, agent_name: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        # Routes agent outputs to appropriate task executor functions
        """
        Execute tasks for a specific agent based on their output
        
        Args:
            task_id: Task identifier
            agent_name: Name of the agent
            agent_output: Output from the agent
            project_dir: Project directory path
            
        Returns:
            Execution results with created files
        """
        try:
            logger.info(f"🚀 Executing tasks for {agent_name} agent")
            
            if agent_name not in self.task_templates:
                logger.warning(f"⚠️ No task template found for {agent_name}")
                return {
                    'status': 'skipped',
                    'reason': f'No task template for {agent_name}'
                }
            
            template = self.task_templates[agent_name]
            executor_func = template['executor']
            
            # Execute the agent-specific tasks
            result = executor_func(task_id, agent_output, project_dir)
            
            logger.info(f"✅ {agent_name} tasks completed")
            return result
            
        except Exception as e:
            logger.error(f"❌ Task execution failed for {agent_name}: {e}")
            return {
                'status': 'failed',
                'error': str(e)
            }
    
    def _execute_analyst_tasks(self, task_id: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        # Creates .tasks and .prd files from analyst output
        """Execute Analyst tasks - create .tasks and .prd files"""
        created_files = []
        
        # Parse requirements from analyst output
        requirements = self._extract_requirements(agent_output)
        features = self._extract_features(agent_output)
        
        # Create .tasks file
        tasks_content = self._generate_tasks_file(requirements, features)
        tasks_file = os.path.join(project_dir, '.tasks')
        with open(tasks_file, 'w', encoding='utf-8') as f:
            f.write(tasks_content)
        created_files.append('.tasks')
        
        # Create .prd file
        prd_content = self._generate_prd_file(agent_output, requirements, features)
        prd_file = os.path.join(project_dir, '.prd')
        with open(prd_file, 'w', encoding='utf-8') as f:
            f.write(prd_content)
        created_files.append('.prd')
        
        return {
            'status': 'completed',
            'files_created': created_files,
            'requirements_count': len(requirements),
            'features_count': len(features)
        }
    
    def _execute_architect_tasks(self, task_id: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        """Execute Architect tasks - create .architecture and .tech-stack files"""
        created_files = []
        
        # Parse architecture from architect output
        architecture = self._extract_architecture(agent_output)
        tech_stack = self._extract_tech_stack(agent_output)
        
        # Create .architecture file
        arch_content = self._generate_architecture_file(architecture)
        arch_file = os.path.join(project_dir, '.architecture')
        with open(arch_file, 'w', encoding='utf-8') as f:
            f.write(arch_content)
        created_files.append('.architecture')
        
        # Create .tech-stack file
        tech_content = self._generate_tech_stack_file(tech_stack)
        tech_file = os.path.join(project_dir, '.tech-stack')
        with open(tech_file, 'w', encoding='utf-8') as f:
            f.write(tech_content)
        created_files.append('.tech-stack')
        
        return {
            'status': 'completed',
            'files_created': created_files,
            'architecture': architecture,
            'tech_stack': tech_stack
        }
    
    def _execute_developer_tasks(self, task_id: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        """Execute Developer tasks - create actual code files"""
        created_files = []
        
        # Read previous agent outputs
        tasks_file = os.path.join(project_dir, '.tasks')
        prd_file = os.path.join(project_dir, '.prd')
        arch_file = os.path.join(project_dir, '.architecture')
        tech_file = os.path.join(project_dir, '.tech-stack')
        
        # Parse previous outputs
        requirements = self._read_tasks_file(tasks_file) if os.path.exists(tasks_file) else []
        prd_data = self._read_prd_file(prd_file) if os.path.exists(prd_file) else {}
        architecture = self._read_architecture_file(arch_file) if os.path.exists(arch_file) else {}
        tech_stack = self._read_tech_stack_file(tech_file) if os.path.exists(tech_file) else {}
        
        # Generate code based on requirements and architecture
        code_files = self._generate_code_files(requirements, prd_data, architecture, tech_stack, project_dir)
        created_files.extend(code_files)
        
        return {
            'status': 'completed',
            'files_created': created_files,
            'code_files_count': len(code_files)
        }
    
    def _execute_devops_tasks(self, task_id: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        """Execute DevOps tasks - create deployment and infrastructure files"""
        created_files = []
        
        # Read previous outputs
        code_files = [f for f in os.listdir(project_dir) if f.endswith(('.py', '.js', '.html', '.css'))]
        
        # Generate deployment files
        deployment_files = self._generate_deployment_files(code_files, project_dir)
        created_files.extend(deployment_files)
        
        return {
            'status': 'completed',
            'files_created': created_files,
            'deployment_files_count': len(deployment_files)
        }
    
    def _execute_pm_tasks(self, task_id: str, agent_output: str, project_dir: str) -> Dict[str, Any]:
        """Execute PM tasks - create timeline and milestone files"""
        created_files = []
        
        # Generate timeline
        timeline_content = self._generate_timeline_file(agent_output)
        timeline_file = os.path.join(project_dir, '.timeline')
        with open(timeline_file, 'w', encoding='utf-8') as f:
            f.write(timeline_content)
        created_files.append('.timeline')
        
        # Generate milestones
        milestones_content = self._generate_milestones_file(agent_output)
        milestones_file = os.path.join(project_dir, '.milestones')
        with open(milestones_file, 'w', encoding='utf-8') as f:
            f.write(milestones_content)
        created_files.append('.milestones')
        
        return {
            'status': 'completed',
            'files_created': created_files
        }
    
    def _extract_requirements(self, text: str) -> List[str]:
        """Extract requirements from analyst output"""
        requirements = []
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
        """Extract architecture from architect output"""
        architecture = {
            'pattern': 'mvc',
            'layers': [],
            'components': []
        }
        
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
    
    def _generate_tasks_file(self, requirements: List[str], features: List[str]) -> str:
        """Generate .tasks file content"""
        content = f"""# Project Tasks
Generated: {datetime.now().isoformat()}

## Requirements
"""
        for i, req in enumerate(requirements, 1):
            content += f"{i}. {req}\n"
        
        content += "\n## Features\n"
        for i, feature in enumerate(features, 1):
            content += f"{i}. {feature}\n"
        
        return content
    
    def _generate_prd_file(self, agent_output: str, requirements: List[str], features: List[str]) -> str:
        """Generate .prd file content"""
        content = f"""# Product Requirements Document
Generated: {datetime.now().isoformat()}

## Overview
{agent_output[:500]}...

## Requirements
"""
        for req in requirements:
            content += f"- {req}\n"
        
        content += "\n## Features\n"
        for feature in features:
            content += f"- {feature}\n"
        
        return content
    
    def _generate_architecture_file(self, architecture: Dict[str, Any]) -> str:
        """Generate .architecture file content"""
        content = f"""# System Architecture
Generated: {datetime.now().isoformat()}

## Architecture Pattern
{architecture['pattern'].upper()}

## Layers
{chr(10).join(architecture['layers'])}

## Components
{chr(10).join(architecture['components'])}
"""
        return content
    
    def _generate_tech_stack_file(self, tech_stack: Dict[str, str]) -> str:
        """Generate .tech-stack file content"""
        content = f"""# Technology Stack
Generated: {datetime.now().isoformat()}

## Frontend
{tech_stack['frontend']}

## Backend
{tech_stack['backend']}

## Database
{tech_stack['database']}
"""
        return content
    
    def _read_tasks_file(self, file_path: str) -> List[str]:
        """Read .tasks file and extract requirements"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            requirements = []
            lines = content.split('\n')
            in_requirements = False
            
            for line in lines:
                if '## Requirements' in line:
                    in_requirements = True
                    continue
                elif '## Features' in line:
                    break
                
                if in_requirements and line.strip() and line.strip().startswith(('1.', '2.', '3.', '4.', '5.')):
                    req = re.sub(r'^\d+\.\s*', '', line.strip())
                    if req:
                        requirements.append(req)
            
            return requirements
        except Exception as e:
            logger.error(f"Error reading tasks file: {e}")
            return []
    
    def _read_prd_file(self, file_path: str) -> Dict[str, Any]:
        """Read .prd file and extract data"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return {
                'content': content,
                'requirements': self._extract_requirements_from_prd(content),
                'features': self._extract_features_from_prd(content)
            }
        except Exception as e:
            logger.error(f"Error reading PRD file: {e}")
            return {}
    
    def _read_architecture_file(self, file_path: str) -> Dict[str, Any]:
        """Read .architecture file and extract data"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return {
                'content': content,
                'pattern': self._extract_architecture_pattern(content)
            }
        except Exception as e:
            logger.error(f"Error reading architecture file: {e}")
            return {}
    
    def _read_tech_stack_file(self, file_path: str) -> Dict[str, str]:
        """Read .tech-stack file and extract data"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tech_stack = {}
            lines = content.split('\n')
            current_section = None
            
            for line in lines:
                if '## Frontend' in line:
                    current_section = 'frontend'
                elif '## Backend' in line:
                    current_section = 'backend'
                elif '## Database' in line:
                    current_section = 'database'
                elif line.strip() and current_section:
                    tech_stack[current_section] = line.strip()
            
            return tech_stack
        except Exception as e:
            logger.error(f"Error reading tech stack file: {e}")
            return {}
    
    def _extract_requirements_from_prd(self, content: str) -> List[str]:
        """Extract requirements from PRD content"""
        requirements = []
        lines = content.split('\n')
        in_requirements = False
        
        for line in lines:
            if '## Requirements' in line:
                in_requirements = True
                continue
            elif '## Features' in line:
                break
            
            if in_requirements and line.strip() and line.strip().startswith('-'):
                req = line.strip()[1:].strip()
                if req:
                    requirements.append(req)
        
        return requirements
    
    def _extract_features_from_prd(self, content: str) -> List[str]:
        """Extract features from PRD content"""
        features = []
        lines = content.split('\n')
        in_features = False
        
        for line in lines:
            if '## Features' in line:
                in_features = True
                continue
            
            if in_features and line.strip() and line.strip().startswith('-'):
                feature = line.strip()[1:].strip()
                if feature:
                    features.append(feature)
        
        return features
    
    def _extract_architecture_pattern(self, content: str) -> str:
        """Extract architecture pattern from content"""
        if 'mvc' in content.lower():
            return 'mvc'
        elif 'microservices' in content.lower():
            return 'microservices'
        elif 'monolithic' in content.lower():
            return 'monolithic'
        return 'mvc'
    
    def _generate_code_files(self, requirements: List[str], prd_data: Dict[str, Any], 
                           architecture: Dict[str, Any], tech_stack: Dict[str, str], 
                           project_dir: str) -> List[str]:
        """Generate actual code files based on requirements and architecture"""
        created_files = []
        
        # Generate backend files
        if tech_stack.get('backend') == 'python':
            app_file = os.path.join(project_dir, 'app.py')
            app_content = self._generate_python_app(requirements, prd_data, architecture)
            with open(app_file, 'w', encoding='utf-8') as f:
                f.write(app_content)
            created_files.append('app.py')
            
            requirements_file = os.path.join(project_dir, 'requirements.txt')
            req_content = self._generate_requirements_file(tech_stack)
            with open(requirements_file, 'w', encoding='utf-8') as f:
                f.write(req_content)
            created_files.append('requirements.txt')
        
        # Generate frontend files
        if tech_stack.get('frontend') == 'html/css/js':
            html_file = os.path.join(project_dir, 'index.html')
            html_content = self._generate_html_file(requirements, prd_data)
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(html_content)
            created_files.append('index.html')
            
            css_file = os.path.join(project_dir, 'styles.css')
            css_content = self._generate_css_file()
            with open(css_file, 'w', encoding='utf-8') as f:
                f.write(css_content)
            created_files.append('styles.css')
            
            js_file = os.path.join(project_dir, 'script.js')
            js_content = self._generate_js_file(requirements)
            with open(js_file, 'w', encoding='utf-8') as f:
                f.write(js_content)
            created_files.append('script.js')
        
        return created_files
    
    def _generate_python_app(self, requirements: List[str], prd_data: Dict[str, Any], 
                           architecture: Dict[str, Any]) -> str:
        """Generate Python Flask application"""
        return f"""#!/usr/bin/env python3
\"\"\"
Generated Flask Application
Requirements: {len(requirements)} items
Architecture: {architecture.get('pattern', 'mvc')}
\"\"\"

from flask import Flask, render_template, request, jsonify
import sqlite3
import json
from datetime import datetime

app = Flask(__name__)

# Database initialization
def init_db():
    conn = sqlite3.connect('app.db')
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
    conn = sqlite3.connect('app.db')
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
    
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute('INSERT INTO items (title, description) VALUES (?, ?)', (title, description))
    conn.commit()
    item_id = cursor.lastrowid
    conn.close()
    
    return jsonify({{'id': item_id, 'title': title, 'description': description, 'completed': False}})

@app.route('/api/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE items SET title=?, description=?, completed=? WHERE id=?',
                   (data.get('title'), data.get('description'), data.get('completed', False), item_id))
    conn.commit()
    conn.close()
    
    return jsonify({{'message': 'Item updated successfully'}})

@app.route('/api/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    cursor.execute('DELETE FROM items WHERE id=?', (item_id,))
    conn.commit()
    conn.close()
    
    return jsonify({{'message': 'Item deleted successfully'}})

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)
"""
    
    def _generate_requirements_file(self, tech_stack: Dict[str, str]) -> str:
        """Generate requirements.txt file"""
        requirements = [
            "Flask==3.0.3",
            "Flask-SQLAlchemy==3.1.1",
            "Flask-CORS==5.0.0"
        ]
        
        if tech_stack.get('database') == 'postgresql':
            requirements.append("psycopg2-binary==2.9.9")
        elif tech_stack.get('database') == 'mysql':
            requirements.append("mysql-connector-python==8.2.0")
        
        return "\n".join(requirements)
    
    def _generate_html_file(self, requirements: List[str], prd_data: Dict[str, Any]) -> str:
        """Generate HTML file"""
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Application</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>Generated Application</h1>
            <p>Requirements: {len(requirements)} items</p>
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
    
    def _generate_css_file(self) -> str:
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
}

.add-item-form button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 15px 30px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
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
}"""
    
    def _generate_js_file(self, requirements: List[str]) -> str:
        """Generate JavaScript file"""
        return f"""// Generated JavaScript
// Requirements: {len(requirements)} items

class TodoApp {{
    constructor() {{
        this.items = [];
        this.init();
    }}
    
    async init() {{
        await this.loadItems();
    }}
    
    async loadItems() {{
        try {{
            const response = await fetch('/api/items');
            this.items = await response.json();
            this.renderItems();
        }} catch (error) {{
            console.error('Error loading items:', error);
        }}
    }}
    
    async addItem(title, description = '') {{
        try {{
            const response = await fetch('/api/items', {{
                method: 'POST',
                headers: {{
                    'Content-Type': 'application/json',
                }},
                body: JSON.stringify({{ title, description }})
            }});
            
            const newItem = await response.json();
            this.items.unshift(newItem);
            this.renderItems();
            this.clearForm();
        }} catch (error) {{
            console.error('Error adding item:', error);
        }}
    }}
    
    renderItems() {{
        const itemsList = document.getElementById('itemsList');
        itemsList.innerHTML = '';
        
        this.items.forEach(item => {{
            const div = document.createElement('div');
            div.className = `item ${{item.completed ? 'completed' : ''}}`;
            div.innerHTML = `
                <h3>${{item.title}}</h3>
                <p>${{item.description || 'No description'}}</p>
            `;
            itemsList.appendChild(div);
        }});
    }}
    
    clearForm() {{
        document.getElementById('itemTitle').value = '';
        document.getElementById('itemDescription').value = '';
    }}
}}

const todoApp = new TodoApp();

function addItem() {{
    const title = document.getElementById('itemTitle').value.trim();
    const description = document.getElementById('itemDescription').value.trim();
    
    if (title) {{
        todoApp.addItem(title, description);
    }}
}}"""
    
    def _generate_deployment_files(self, code_files: List[str], project_dir: str) -> List[str]:
        """Generate deployment files"""
        created_files = []
        
        # Create Dockerfile
        dockerfile_content = self._generate_dockerfile(code_files)
        dockerfile_path = os.path.join(project_dir, 'Dockerfile')
        with open(dockerfile_path, 'w', encoding='utf-8') as f:
            f.write(dockerfile_content)
        created_files.append('Dockerfile')
        
        # Create docker-compose.yml
        compose_content = self._generate_docker_compose()
        compose_path = os.path.join(project_dir, 'docker-compose.yml')
        with open(compose_path, 'w', encoding='utf-8') as f:
            f.write(compose_content)
        created_files.append('docker-compose.yml')
        
        return created_files
    
    def _generate_dockerfile(self, code_files: List[str]) -> str:
        """Generate Dockerfile"""
        return """FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "app.py"]"""
    
    def _generate_docker_compose(self) -> str:
        """Generate docker-compose.yml"""
        return """version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - FLASK_APP=app.py
      - FLASK_ENV=production"""
    
    def _generate_timeline_file(self, agent_output: str) -> str:
        """Generate .timeline file"""
        return f"""# Project Timeline
Generated: {datetime.now().isoformat()}

## Overview
{agent_output[:300]}...

## Phases
1. Analysis Phase - 1-2 days
2. Planning Phase - 1-2 days  
3. Development Phase - 3-5 days
4. Testing Phase - 1-2 days
5. Deployment Phase - 1 day

## Total Duration: 7-12 days"""
    
    def _generate_milestones_file(self, agent_output: str) -> str:
        """Generate .milestones file"""
        return f"""# Project Milestones
Generated: {datetime.now().isoformat()}

## Milestones
1. Requirements Analysis Complete
2. Architecture Design Complete
3. Core Development Complete
4. Testing Complete
5. Deployment Complete

## Status: In Progress""" 