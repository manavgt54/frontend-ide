"""
Adaptive System API Routes Module

This module defines the API endpoints for the Adaptive System, including task management,
file operations, system configuration, agent management, and real-time updates.
"""

import os
import asyncio
from flask import Blueprint, request, jsonify, send_file
from flask_cors import cross_origin
from werkzeug.utils import secure_filename
from typing import Dict, Any, List
import json
import uuid
from datetime import datetime
from pathlib import Path

from src.core.task_manager import TaskManager, TaskStatus
from src.core.orchestrator import Orchestrator
from src.core.file_parser import FileParser
from src.mcp_handlers.file_io_handler import FileIOHandler
from src.utils.logger import get_logger, get_task_logs
from src.utils.token_meter import TokenMeter
from src.agents.agent_manager import AgentManager
from src.llm_clients.gemini_cli_client import GeminiCLIClient
from src.workflows.master_workflow import MasterWorkflow
from src.models.workflow import Workflow
from src.models.user import db
from src.models.mcp import MCPServer
from sqlalchemy import text

logger = get_logger(__name__)

# Create Blueprint
adaptive_system_bp = Blueprint('adaptive_system', __name__)

# Initialize components
task_manager = TaskManager()
orchestrator = Orchestrator()
file_parser = FileParser()
file_handler = FileIOHandler()
token_meter = TokenMeter()
agent_manager = AgentManager()

# Initialize Gemini CLI client
gemini_cli_client = GeminiCLIClient()
master_workflow = MasterWorkflow(agent_manager, gemini_cli_client, token_meter)

# ---- Lightweight schema guard for SQLite (adds tasks.workflow_id if missing) ----
def _ensure_tasks_schema():
	try:
		engine = db.engine
		with engine.connect() as conn:
			try:
				result = conn.execute(text("PRAGMA table_info(tasks)"))
				cols = [row[1] for row in result]
				if 'workflow_id' not in cols:
					conn.execute(text("ALTER TABLE tasks ADD COLUMN workflow_id VARCHAR(36)"))
					logger.info("Added missing column tasks.workflow_id")
				# New: memory_json column
				if 'memory_json' not in cols:
					conn.execute(text("ALTER TABLE tasks ADD COLUMN memory_json TEXT"))
					logger.info("Added missing column tasks.memory_json")
			except Exception as e:
				logger.warning(f"Schema guard failed to inspect/add column: {e}")
	except Exception as e:
		logger.warning(f"Schema guard could not acquire engine: {e}")

# ---- Lightweight schema guard for SQLite (adds workflows.agent_models if missing) ----
def _ensure_workflows_schema():
	try:
		engine = db.engine
		with engine.connect() as conn:
			try:
				result = conn.execute(text("PRAGMA table_info(workflows)"))
				cols = [row[1] for row in result]
				if 'agent_models' not in cols:
					conn.execute(text("ALTER TABLE workflows ADD COLUMN agent_models TEXT"))
					logger.info("Added missing column workflows.agent_models")
				# New: add temperatures column
				if 'agent_temperatures' not in cols:
					conn.execute(text("ALTER TABLE workflows ADD COLUMN agent_temperatures TEXT"))
					logger.info("Added missing column workflows.agent_temperatures")
			except Exception as e:
				logger.warning(f"Workflows schema guard failed: {e}")
	except Exception as e:
		logger.warning(f"Workflows schema guard could not acquire engine: {e}")

# Configuration
import tempfile, os
UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), 'adaptive_system_uploads')
ALLOWED_EXTENSIONS = {
	'txt', 'md', 'json', 'csv', 'docx', 'pdf', 'xlsx', 'pptx',
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
	"""Check if file extension is allowed"""
	return '.' in filename and \
			   filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Health Check
@adaptive_system_bp.route('/api/health', methods=['GET'])
@cross_origin()
def health_check():
	"""System health check"""
	try:
		# Check component status
		components = {
			'task_manager': 'operational',
			'orchestrator': 'operational',
			'file_parser': 'operational',
			'token_meter': 'operational',
			'agent_manager': f"{len(agent_manager.get_agent_names())} agents loaded",
			'gemini_cli': 'operational' if gemini_cli_client.get_model_info()['api_key_configured'] else 'not configured'
		}
		
		return jsonify({
			'status': 'healthy',
			'message': 'Adaptive System is running',
			'components': components
		})
		
	except Exception as e:
		logger.error(f"Health check failed: {e}")
		return jsonify({
			'status': 'unhealthy',
			'message': str(e)
		}), 500

# Task Management
@adaptive_system_bp.route('/api/tasks', methods=['POST'])
@cross_origin()
def create_task():
	"""Create a new task with master workflow"""
	try:
		_ensure_tasks_schema()
		_ensure_workflows_schema()
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		# Accept both 'user_prompt' and 'prompt' field names
		user_prompt = data.get('user_prompt') or data.get('prompt')
		if not user_prompt:
			return jsonify({'error': 'user_prompt or prompt is required'}), 400
		
		# Optional parameters - accept both naming conventions
		custom_workflow = data.get('custom_workflow') or data.get('workflow_sequence') or []
		custom_agent_prompts = data.get('custom_agent_prompts') or data.get('agent_specific_prompts') or {}
		workflow_id = data.get('workflow_id')  # New: support workflow selection by ID
		per_agent_models = data.get('agent_models') or []
		per_agent_temperatures = data.get('agent_temperatures') or []
		
		# If workflow_id is provided, get the workflow sequence from the database
		if workflow_id:
			workflow = Workflow.query.get(workflow_id)
			if workflow and workflow.is_active:
				wf_dict = workflow.to_dict()
				custom_workflow = wf_dict['agent_sequence']
				per_agent_models = wf_dict.get('agent_models', [])
				per_agent_temperatures = wf_dict.get('agent_temperatures', [])
			else:
				return jsonify({'error': 'Invalid workflow ID'}), 400
		
		# Create task
		task_id = task_manager.create_task(user_prompt, metadata={'workflow_id': workflow_id} if workflow_id else None)
		# If workflow_id provided, set it early to avoid stale sequence usage
		if workflow_id:
			try:
				from src.models.task import Task as TaskModel
				from src.models.user import db as _db
				t = TaskModel.query.get(task_id)
				if t and hasattr(t, 'workflow_id'):
					t.workflow_id = workflow_id
					_db.session.commit()
			except Exception as _e:
				logger.warning(f"Deferred workflow_id set failed for {task_id}: {_e}")
		
		# Start token tracking
		token_meter.start_build_timer(task_id)
		
		# Clear previous CLI logs for new task
		master_workflow.clear_cli_logs()
		
		# Get the Flask app instance from the current request context
		from flask import current_app
		app = current_app._get_current_object()
		
		# Start master workflow execution in a separate thread
		import threading
		
		def run_workflow(flask_app, task_id, user_prompt, custom_workflow, custom_agent_prompts, per_agent_models, per_agent_temperatures):
			"""Run workflow in a separate thread with proper Flask app context"""
			import asyncio
			
			# Create new event loop for this thread
			loop = asyncio.new_event_loop()
			asyncio.set_event_loop(loop)
			
			try:
				# Create Flask app context for the thread
				with flask_app.app_context():
					try:
						# Execute the workflow
						result = loop.run_until_complete(
							master_workflow.execute_workflow(
								task_id, user_prompt, custom_workflow, custom_agent_prompts, per_agent_models, per_agent_temperatures
							)
						)
						
						# Update task with workflow result
						from src.models.task import Task
						from src.models.user import db
						
						task = Task.query.get(task_id)
						if task:
							if result.get('status') in ['completed', 'success']:
								task.status = 'completed'
								logger.info(f"Task {task_id} completed successfully")
							else:
								task.status = 'failed'
								logger.warning(f"Task {task_id} failed: {result.get('error', 'Unknown error')}")
							
							db.session.commit()
							logger.info(f"Task {task_id} status updated to: {task.status}")
						else:
							logger.error(f"Task {task_id} not found in database")
							
					except Exception as e:
						logger.error(f"Workflow execution error for task {task_id}: {e}")
						
						# Update task status to failed
						try:
							from src.models.task import Task
							from src.models.user import db
							
							task = Task.query.get(task_id)
							if task:
								task.status = 'failed'
								db.session.commit()
								logger.info(f"Task {task_id} status set to failed due to exception")
							else:
								logger.error(f"Task {task_id} not found when trying to set failed status")
						except Exception as db_error:
							logger.error(f"Failed to update task {task_id} status to failed: {db_error}")
							
			except Exception as context_error:
				logger.error(f"Error in workflow thread context for task {task_id}: {context_error}")
			finally:
				# Clean up the event loop
				try:
					loop.close()
				except Exception as loop_error:
					logger.error(f"Error closing event loop for task {task_id}: {loop_error}")
		
		# Start the thread with the Flask app instance
		thread = threading.Thread(
			target=run_workflow,
			args=(app, task_id, user_prompt, custom_workflow, custom_agent_prompts, per_agent_models, per_agent_temperatures),
			name=f"workflow-{task_id}"
		)
		thread.daemon = True  # Thread will die when main thread dies
		thread.start()
		
		logger.info(f"Created new task with master workflow: {task_id}")
		
		return jsonify({
			'task_id': task_id,
			'status': 'received',
			'message': 'Task created successfully and master workflow initiated'
		}), 201
		
	except Exception as e:
		logger.error(f"Error creating task: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/memory', methods=['GET'])
@cross_origin()
def get_task_memory(task_id):
	try:
		_ensure_tasks_schema()
		mem = task_manager.get_task_memory(task_id)
		return jsonify(mem)
	except Exception as e:
		logger.error(f"Error getting memory for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/memory', methods=['PUT'])
@cross_origin()
def update_task_memory(task_id):
	try:
		_ensure_tasks_schema()
		data = request.get_json() or {}
		if 'history' not in data or not isinstance(data['history'], list):
			return jsonify({'error': 'history array required'}), 400
		from src.models.task import Task as TaskModel
		t = TaskModel.query.get(task_id)
		if not t:
			return jsonify({'error': 'Task not found'}), 404
		t.memory_json = json.dumps({'history': data['history']})
		db.session.commit()
		return jsonify({'message': 'Memory updated'})
	except Exception as e:
		logger.error(f"Error updating memory for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks', methods=['GET'])
@cross_origin()
def get_tasks():
	"""Get all tasks"""
	try:
		_ensure_tasks_schema()
		tasks = task_manager.get_all_tasks()
		return jsonify({'tasks': tasks})
		
	except Exception as e:
		logger.error(f"Error getting tasks: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>', methods=['GET'])
@cross_origin()
def get_task(task_id):
	"""Get details for a specific task with accurate current agent and progress"""
	try:
		data = _compute_monitor_data(task_id)
		if isinstance(data, tuple):
			# Already a (response, status) tuple
			return data
		return jsonify(data)
	except Exception as e:
		logger.error(f"Error getting task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/cli-logs', methods=['GET'])
@cross_origin()
def get_task_cli_logs(task_id):
	"""Get CLI logs for a specific task"""
	try:
		# Get CLI logs from master workflow
		cli_logs = master_workflow.get_cli_logs()
		
		# Filter logs for this task using the task_id field we tag in logs
		task_logs = [log for log in cli_logs if log.get('task_id') == task_id]
		
		return jsonify({
			'task_id': task_id,
			'cli_logs': task_logs,
			'total_logs': len(task_logs)
		})
		
	except Exception as e:
		logger.error(f"Error getting CLI logs for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/monitor', methods=['GET'])
@cross_origin()
def get_task_monitor_data(task_id):
	"""Get comprehensive task monitoring data including logs and progress"""
	try:
		data = _compute_monitor_data(task_id)
		if isinstance(data, tuple):
			return data
		return jsonify(data)
	except Exception as e:
		logger.error(f"Error getting monitor data for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

def _compute_monitor_data(task_id: str):
	"""Compute monitor data used by both /tasks/<id> and /tasks/<id>/monitor"""
	# Get task details
	task = task_manager.get_task(task_id)
	if not task:
		return jsonify({'error': 'Task not found'}), 404

	# Handle both Task model objects and dictionaries
	if isinstance(task, dict):
		task_status = task.get('status', 'unknown')
		task_created_at = task.get('created_at')
		task_updated_at = task.get('updated_at')
		task_workflow_id = task.get('workflow_id')  # May not exist in older tasks
		task_current_agent = task.get('current_agent')
		task_progress_percentage = task.get('progress_percentage', 0)
	else:
		# Task model object
		task_status = task.status if hasattr(task, 'status') else 'unknown'
		task_created_at = task.created_at if hasattr(task, 'created_at') else None
		task_updated_at = task.updated_at if hasattr(task, 'updated_at') else None
		task_workflow_id = getattr(task, 'workflow_id', None)  # May not exist in older tasks
		task_current_agent = task.current_agent if hasattr(task, 'current_agent') else None
		task_progress_percentage = task.progress_percentage if hasattr(task, 'progress_percentage') else 0

	# Get CLI logs from master workflow
	cli_logs = master_workflow.get_cli_logs()
	# Filter logs for this specific task
	task_logs = [log for log in cli_logs if log.get('task_id') == task_id]
	current_agent_from_logs = None
	completed_agents = []

	# Extract current and completed agents from logs
	for log in task_logs:
		message = log.get('message', '').lower()
		if 'executing agent' in message:
			import re
			agent_match = re.search(r'executing agent \d+/\d+: (\w+)', message)
			if agent_match:
				current_agent_from_logs = agent_match.group(1)
		if 'completed successfully' in message and 'agent' in message:
			import re
			agent_match = re.search(r'(\w+) completed successfully', message)
			if agent_match:
				completed_agent = agent_match.group(1)
				if completed_agent not in completed_agents:
					completed_agents.append(completed_agent)

	# Prefer DB task fields updated by MasterWorkflow for status
	progress_data = {
		'current_agent': task_current_agent,
		'progress_percentage': task_progress_percentage
	}

	# Resolve workflow sequence
	workflow_sequence = []
	try:
		if task_workflow_id:
			from src.models.workflow import Workflow
			workflow = Workflow.query.get(task_workflow_id)
			if workflow:
				# Parse JSON stored agent_sequence into a Python list
				try:
					import json
					seq = workflow.agent_sequence
					if isinstance(seq, str):
						workflow_sequence = json.loads(seq)
					elif isinstance(seq, list):
						workflow_sequence = seq
					else:
						workflow_sequence = []
				except Exception:
					workflow_sequence = []
	except Exception as e:
		logger.warning(f"Could not get workflow sequence for task {task_id}: {e}")

	# If still empty, try to peek the TaskState context for any saved agent sequence
	if not workflow_sequence:
		try:
			state = task_manager.get_task_state(task_id)
			if state and isinstance(state.context, dict):
				seq = state.context.get('agent_sequence')
				if isinstance(seq, list) and seq:
					workflow_sequence = seq
		except Exception:
			pass

	# Fallback to default agent manager sequence when unknown/empty
	if not workflow_sequence:
		try:
			workflow_sequence = agent_manager.get_default_workflow_sequence()
		except Exception:
			workflow_sequence = []

	# Handle datetime conversion safely
	def safe_isoformat(dt):
		if dt is None:
			return None
		if isinstance(dt, str):
			return dt  # Already a string
		try:
			return dt.isoformat()
		except:
			return str(dt)

	# Calculate progress percentage based on completed agents and workflow sequence
	progress_percentage = progress_data.get('progress_percentage', 0)
	if workflow_sequence:
		completed_count = len(completed_agents) if completed_agents else 0
		total_agents = len(workflow_sequence)
		if total_agents > 0:
			progress_percentage = max(progress_percentage, int((completed_count / total_agents) * 100))

	# Use the most accurate current agent
	current_agent = current_agent_from_logs or progress_data.get('current_agent')
	if not current_agent and workflow_sequence:
		completed_count = len(completed_agents) if completed_agents else 0
		if completed_count < len(workflow_sequence):
			current_agent = workflow_sequence[completed_count]

	return {
		'task_id': task_id,
		'status': task_status,
		'progress_percentage': progress_percentage,
		'current_agent': current_agent,
		'workflow_sequence': workflow_sequence,
		'completed_agents': completed_agents,
		'cli_logs': task_logs,
		'total_logs': len(task_logs),
		'created_at': safe_isoformat(task_created_at),
		'updated_at': safe_isoformat(task_updated_at)
	}

@adaptive_system_bp.route('/api/tasks/<task_id>/pause', methods=['POST'])
@cross_origin()
def pause_task(task_id):
	"""Pause a running task"""
	try:
		success = task_manager.pause_task(task_id)
		
		if not success:
			return jsonify({'error': 'Task not found or cannot be paused'}), 404
		
		return jsonify({'message': 'Task paused successfully'})
		
	except Exception as e:
		logger.error(f"Error pausing task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/resume', methods=['POST'])
@cross_origin()
def resume_task(task_id):
	"""Resume a paused task"""
	try:
		success = task_manager.resume_task(task_id)
		
		if not success:
			return jsonify({'error': 'Task not found or cannot be resumed'}), 404
		
		return jsonify({'message': 'Task resumed successfully'})
		
	except Exception as e:
		logger.error(f"Error resuming task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/cancel', methods=['POST'])
@cross_origin()
def cancel_task(task_id):
	"""Cancel a task"""
	try:
		success = task_manager.cancel_task(task_id)
		
		if not success:
			return jsonify({'error': 'Task not found or cannot be cancelled'}), 404
		
		return jsonify({'message': 'Task cancelled successfully'})
		
	except Exception as e:
		logger.error(f"Error cancelling task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/reexecute', methods=['POST'])
@cross_origin()
def reexecute_task(task_id):
	"""Re-execute a workflow on an existing task in the same project folder.
	Accepts a new user prompt, an optional custom workflow sequence or workflow_id,
	and an optional starting agent to begin from within the sequence.
	"""
	try:
		_ensure_tasks_schema()
		data = request.get_json()
		if not data:
			return jsonify({'error': 'No data provided'}), 400
 
		# New prompt to drive modifications/fixes
		user_prompt = data.get('user_prompt') or data.get('prompt')
		if not user_prompt:
			return jsonify({'error': 'user_prompt or prompt is required'}), 400
 
		# Optional: custom workflow by id or explicit sequence
		custom_workflow = data.get('custom_workflow') or data.get('workflow_sequence') or []
		workflow_id = data.get('workflow_id')
		start_agent = data.get('start_agent')  # e.g., 'developer', 'tester'
		custom_agent_prompts = data.get('custom_agent_prompts') or data.get('agent_specific_prompts') or {}
 
		# Validate task exists
		task = task_manager.get_task(task_id)
		if not task:
			return jsonify({'error': 'Task not found'}), 404
 
		# Resolve workflow sequence if workflow_id is provided
		if workflow_id and not custom_workflow:
			wf = Workflow.query.get(workflow_id)
			if wf and wf.is_active:
				custom_workflow = wf.to_dict().get('agent_sequence', [])
			else:
				return jsonify({'error': 'Invalid workflow ID'}), 400
 
		# Fallback to default sequence if none provided
		if not custom_workflow:
			try:
				custom_workflow = agent_manager.get_default_workflow_sequence()
			except Exception:
				custom_workflow = []
 
		# If a starting agent is provided and present in the sequence, slice from there
		if start_agent and isinstance(custom_workflow, list) and start_agent in custom_workflow:
			start_index = custom_workflow.index(start_agent)
			custom_workflow = custom_workflow[start_index:]
 
		# Persist selected workflow on the existing task for accurate monitor sequence
		if workflow_id:
			try:
				from src.models.task import Task as TaskModel
				t = TaskModel.query.get(task_id)
				if t and hasattr(t, 'workflow_id'):
					setattr(t, 'workflow_id', workflow_id)
					db.session.commit()
			except Exception as _e:
				logger.warning(f"Could not persist workflow_id on task {task_id} during re-execution: {_e}")

		# Update memory with this new prompt and reset agent progress for this run
		try:
			completed = []
			remaining = list(custom_workflow) if isinstance(custom_workflow, list) else []
			task_manager.append_memory_entry(task_id, user_prompt, workflow_id, completed, remaining)
		except Exception:
			pass

		# Update task status to in_progress and reset progress
		task_manager.update_task_status(task_id, TaskStatus.IN_PROGRESS)
		task_manager.update_task_progress(task_id, custom_workflow[0] if custom_workflow else (task.get('current_agent') if isinstance(task, dict) else None) or 'unknown', 0)
 
		# Do NOT clear CLI logs here to preserve historical runs; frontend filters by task_id
 
		# Run in background thread similar to create_task
		from flask import current_app
		app = current_app._get_current_object()
 
		import threading, asyncio
 
		def run_rerun_workflow(flask_app, task_id, user_prompt, custom_workflow, custom_agent_prompts):
			loop = asyncio.new_event_loop()
			asyncio.set_event_loop(loop)
			try:
				with flask_app.app_context():
					try:
						result = loop.run_until_complete(
							master_workflow.execute_workflow(
								task_id, user_prompt, custom_workflow, custom_agent_prompts
							)
						)
						# Update task status based on result
						from src.models.task import Task as TaskModel
						t = TaskModel.query.get(task_id)
						if t:
							t.status = 'completed' if result.get('status') in ['completed', 'success'] else 'failed'
							db.session.commit()
					except Exception as e:
						logger.error(f"Re-execution workflow error for task {task_id}: {e}")
						try:
							from src.models.task import Task as TaskModel
							t = TaskModel.query.get(task_id)
							if t:
								t.status = 'failed'
								db.session.commit()
						except Exception as db_error:
							logger.error(f"Failed to set task {task_id} to failed after error: {db_error}")
			finally:
				try:
					loop.close()
				except Exception as loop_error:
					logger.error(f"Error closing event loop for task {task_id}: {loop_error}")
 
		thread = threading.Thread(
			target=run_rerun_workflow,
			args=(app, task_id, user_prompt, custom_workflow, custom_agent_prompts),
			name=f"workflow-rerun-{task_id}"
		)
		thread.daemon = True
		thread.start()
 
		return jsonify({
			'task_id': task_id,
			'status': 'in_progress',
			'message': 'Re-execution started successfully',
			'workflow_sequence': custom_workflow
		}), 202
 
	except Exception as e:
		logger.error(f"Error re-executing task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Configuration Management
@adaptive_system_bp.route('/api/config', methods=['GET'])
@cross_origin()
def get_config():
	"""Get system configuration"""
	try:
		gemini_info = gemini_cli_client.get_model_info()
		
		config = {
			'gemini_api_key_configured': gemini_info['api_key_configured'],
			'current_model': gemini_info['model_name'],
			'available_models': ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
			'max_cost_per_day': float(os.getenv('MAX_COST_PER_DAY', 100.0)),
			'max_requests_per_day': int(os.getenv('MAX_REQUESTS_PER_DAY', 1000)),
			'max_tokens_per_day': int(os.getenv('MAX_TOKENS_PER_DAY', 1000000)),
			'upload_folder': UPLOAD_FOLDER,
			'allowed_extensions': list(ALLOWED_EXTENSIONS),
			'max_file_size': MAX_FILE_SIZE
		}
		
		return jsonify(config)
		
	except Exception as e:
		logger.error(f"Error getting config: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/config', methods=['PUT'])
@cross_origin()
def update_config():
	"""Update system configuration"""
	try:
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		# Update Gemini API key
		if 'gemini_api_key' in data:
			gemini_cli_client.update_api_key(data['gemini_api_key'])
		
		# Update model
		if 'current_model' in data:
			gemini_cli_client.switch_model(data['current_model'])
		
		return jsonify({'message': 'Configuration updated successfully'})
		
	except Exception as e:
		logger.error(f"Error updating config: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Agent Management
@adaptive_system_bp.route('/api/agents/prompts', methods=['GET'])
@cross_origin()
def get_agent_prompts():
	"""Get all agent prompts (built-in and custom)"""
	try:
		agents = agent_manager.get_all_agents()
		
		# Add current_prompt field for compatibility
		for agent_name, agent_info in agents.items():
			if 'current_prompt' not in agent_info:
				agent_info['current_prompt'] = agent_manager.get_agent_prompt(agent_name)
		
		return jsonify({'agents': agents})
		
	except Exception as e:
		logger.error(f"Error getting agent prompts: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/prompts/<agent_name>', methods=['PUT'])
@cross_origin()
def update_agent_prompt(agent_name):
	"""Update an agent's prompt"""
	try:
		data = request.get_json()
		
		if not data or 'prompt' not in data:
			return jsonify({'error': 'Prompt is required'}), 400
		
		success = agent_manager.update_agent_prompt(agent_name, data['prompt'])
		
		if not success:
			return jsonify({'error': 'Agent not found'}), 404
		
		return jsonify({'message': f'Agent {agent_name} prompt updated successfully'})
		
	except Exception as e:
		logger.error(f"Error updating agent prompt for {agent_name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/prompts/<agent_name>/reset', methods=['POST'])
@cross_origin()
def reset_agent_prompt(agent_name):
	"""Reset an agent's prompt to default"""
	try:
		success = agent_manager.reset_agent_prompt(agent_name)
		
		if not success:
			return jsonify({'error': 'Agent not found'}), 404
		
		return jsonify({'message': f'Agent {agent_name} prompt reset to default'})
		
	except Exception as e:
		logger.error(f"Error resetting agent prompt for {agent_name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/instructions/<agent_name>', methods=['PUT'])
@cross_origin()
def update_agent_instructions(agent_name):
	"""Update an agent's instructions"""
	try:
		data = request.get_json()
		
		if not data or 'instructions' not in data:
			return jsonify({'error': 'Instructions are required'}), 400
		
		success = agent_manager.update_agent_instructions(agent_name, data['instructions'])
		
		if not success:
			return jsonify({'error': 'Agent not found'}), 404
		
		return jsonify({'message': f'Agent {agent_name} instructions updated successfully'})
		
	except Exception as e:
		logger.error(f"Error updating agent instructions for {agent_name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Handoff prompts management
@adaptive_system_bp.route('/api/agents/handoff/<agent_name>', methods=['GET'])
@cross_origin()
def get_handoff_prompt(agent_name):
	try:
		prompt = agent_manager.get_handoff_prompt(agent_name)
		return jsonify({'agent': agent_name, 'handoff_prompt': prompt})
	except Exception as e:
		logger.error(f"Error getting handoff prompt for {agent_name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/handoff/<agent_name>', methods=['PUT'])
@cross_origin()
def update_handoff_prompt(agent_name):
	try:
		data = request.get_json()
		if data is None or 'handoff_prompt' not in data:
			return jsonify({'error': 'handoff_prompt is required'}), 400
		ok = agent_manager.update_handoff_prompt(agent_name, data['handoff_prompt'])
		if not ok:
			return jsonify({'error': 'Failed to update handoff prompt'}), 400
		return jsonify({'message': f'Handoff prompt updated for {agent_name}'})
	except Exception as e:
		logger.error(f"Error updating handoff prompt for {agent_name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Custom Agent Management
@adaptive_system_bp.route('/api/agents/custom', methods=['GET'])
@cross_origin()
def get_custom_agents():
	"""Get all custom agents"""
	try:
		from src.models.custom_agent import CustomAgent
		custom_agents = CustomAgent.get_active_custom_agents()
		return jsonify({
			'custom_agents': [agent.to_dict() for agent in custom_agents]
		})
		
	except Exception as e:
		logger.error(f"Error getting custom agents: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/custom', methods=['POST'])
@cross_origin()
def create_custom_agent():
	"""Create a new custom agent"""
	try:
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		name = data.get('name')
		display_name = data.get('display_name')
		description = data.get('description', '')
		prompt = data.get('prompt')
		instructions = data.get('instructions', '')
		
		if not name or not display_name or not prompt:
			return jsonify({'error': 'Name, display_name, and prompt are required'}), 400
		
		# Check if agent name already exists (built-in or custom)
		if agent_manager.validate_agent_name(name):
			return jsonify({'error': 'Agent name already exists'}), 400
		
		from src.models.custom_agent import CustomAgent
		import uuid
		
		# Check if custom agent name already exists
		existing_agent = CustomAgent.query.filter_by(name=name).first()
		if existing_agent:
			return jsonify({'error': 'Custom agent with this name already exists'}), 400
		
		# Create new custom agent
		custom_agent = CustomAgent(
			id=str(uuid.uuid4()),
			name=name,
			display_name=display_name,
			description=description,
			prompt=prompt,
			instructions=instructions,
			is_active=True,
			created_by='user'
		)
		
		db.session.add(custom_agent)
		db.session.commit()
		
		logger.info(f"Created new custom agent: {name}")
		
		return jsonify({
			'message': 'Custom agent created successfully',
			'agent': custom_agent.to_dict()
		}), 201
		
	except Exception as e:
		logger.error(f"Error creating custom agent: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/custom/<agent_id>', methods=['GET'])
@cross_origin()
def get_custom_agent(agent_id):
	"""Get a specific custom agent"""
	try:
		from src.models.custom_agent import CustomAgent
		custom_agent = CustomAgent.query.get(agent_id)
		
		if not custom_agent:
			return jsonify({'error': 'Custom agent not found'}), 404
		
		return jsonify(custom_agent.to_dict())
		
	except Exception as e:
		logger.error(f"Error getting custom agent {agent_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/custom/<agent_id>', methods=['PUT'])
@cross_origin()
def update_custom_agent(agent_id):
	"""Update a custom agent"""
	try:
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		from src.models.custom_agent import CustomAgent
		custom_agent = CustomAgent.query.get(agent_id)
		
		if not custom_agent:
			return jsonify({'error': 'Custom agent not found'}), 404
		
		# Update fields
		if 'name' in data:
			# Check if new name conflicts with existing agent
			if agent_manager.validate_agent_name(data['name']) and data['name'] != custom_agent.name:
				return jsonify({'error': 'Agent name already exists'}), 400
			custom_agent.name = data['name']
		
		if 'display_name' in data:
			custom_agent.display_name = data['display_name']
		
		if 'description' in data:
			custom_agent.description = data['description']
		
		if 'prompt' in data:
			custom_agent.prompt = data['prompt']
		
		if 'instructions' in data:
			custom_agent.instructions = data['instructions']
		
		if 'is_active' in data:
			custom_agent.is_active = data['is_active']
		
		custom_agent.updated_at = datetime.utcnow()
		db.session.commit()
		
		logger.info(f"Updated custom agent: {custom_agent.name}")
		
		return jsonify({
			'message': 'Custom agent updated successfully',
			'agent': custom_agent.to_dict()
		})
		
	except Exception as e:
		logger.error(f"Error updating custom agent {agent_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/custom/<agent_id>', methods=['DELETE'])
@cross_origin()
def delete_custom_agent(agent_id):
	"""Delete a custom agent"""
	try:
		from src.models.custom_agent import CustomAgent
		custom_agent = CustomAgent.query.get(agent_id)
		
		if not custom_agent:
			return jsonify({'error': 'Custom agent not found'}), 404
		
		# Soft delete by setting is_active to False
		custom_agent.is_active = False
		custom_agent.updated_at = datetime.utcnow()
		db.session.commit()
		
		logger.info(f"Deleted custom agent: {custom_agent.name}")
		
		return jsonify({'message': 'Custom agent deleted successfully'})
		
	except Exception as e:
		logger.error(f"Error deleting custom agent {agent_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/agents/custom/<agent_id>/copy', methods=['POST'])
@cross_origin()
def copy_custom_agent(agent_id):
	"""Copy a custom agent"""
	try:
		_ensure_workflows_schema()
		data = request.get_json()
		
		if not data or 'name' not in data:
			return jsonify({'error': 'New agent name is required'}), 400
		
		from src.models.custom_agent import CustomAgent
		import uuid
		
		original_agent = CustomAgent.query.get(agent_id)
		
		if not original_agent:
			return jsonify({'error': 'Custom agent not found'}), 404
		
		# Check if new name already exists
		if agent_manager.validate_agent_name(data['name']):
			return jsonify({'error': 'Agent name already exists'}), 400
		
		# Create copy
		new_agent = CustomAgent(
			id=str(uuid.uuid4()),
			name=data['name'],
			display_name=data.get('display_name', f"Copy of {original_agent.display_name}"),
			description=data.get('description', original_agent.description),
			prompt=original_agent.prompt,
			instructions=original_agent.instructions,
			is_active=True,
			created_by='user'
		)
		
		db.session.add(new_agent)
		db.session.commit()
		
		logger.info(f"Copied custom agent {original_agent.name} to {new_agent.name}")
		
		return jsonify({
			'message': 'Custom agent copied successfully',
			'agent': new_agent.to_dict()
		}), 201
		
	except Exception as e:
		logger.error(f"Error copying custom agent {agent_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Workflow Management
@adaptive_system_bp.route('/api/workflows', methods=['GET'])
@cross_origin()
def get_workflows():
	"""Get all workflows"""
	try:
		_ensure_workflows_schema()
		workflows = Workflow.get_active_workflows()
		return jsonify({
			'workflows': [workflow.to_dict() for workflow in workflows]
		})
		
	except Exception as e:
		logger.error(f"Error getting workflows: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows', methods=['POST'])
@cross_origin()
def create_workflow():
	"""Create a new workflow"""
	try:
		_ensure_workflows_schema()
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		name = data.get('name')
		description = data.get('description', '')
		agent_sequence = data.get('agent_sequence', [])
		agent_models = data.get('agent_models', [])
		agent_temperatures = data.get('agent_temperatures', [])
		
		if not name:
			return jsonify({'error': 'Workflow name is required'}), 400
		
		if not agent_sequence:
			return jsonify({'error': 'Agent sequence is required'}), 400
		
		# Check if workflow name already exists
		existing_workflow = Workflow.query.filter_by(name=name).first()
		if existing_workflow:
			return jsonify({'error': 'Workflow with this name already exists'}), 400
		
		# Align arrays
		if not agent_models:
			agent_models = [None] * len(agent_sequence)
		if not agent_temperatures:
			# default None means use system default
			agent_temperatures = [None] * len(agent_sequence)
		
		# Create new workflow
		import uuid
		workflow = Workflow(
			id=str(uuid.uuid4()),
			name=name,
			description=description,
			agent_sequence=json.dumps(agent_sequence),
			agent_models=json.dumps(agent_models),
			agent_temperatures=json.dumps(agent_temperatures),
			is_default=False,
			is_active=True,
			created_by='user'
		)
		
		db.session.add(workflow)
		db.session.commit()
		
		logger.info(f"Created new workflow: {name}")
		
		return jsonify({
			'message': 'Workflow created successfully',
			'workflow': workflow.to_dict()
		}), 201
		
	except Exception as e:
		logger.error(f"Error creating workflow: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows/<workflow_id>', methods=['GET'])
@cross_origin()
def get_workflow(workflow_id):
	"""Get a specific workflow"""
	try:
		_ensure_workflows_schema()
		workflow = Workflow.query.get(workflow_id)
		
		if not workflow:
			return jsonify({'error': 'Workflow not found'}), 404
		
		return jsonify(workflow.to_dict())
		
	except Exception as e:
		logger.error(f"Error getting workflow {workflow_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows/<workflow_id>', methods=['PUT'])
@cross_origin()
def update_workflow(workflow_id):
	"""Update a workflow"""
	try:
		_ensure_workflows_schema()
		data = request.get_json()
		
		if not data:
			return jsonify({'error': 'No data provided'}), 400
		
		workflow = Workflow.query.get(workflow_id)
		
		if not workflow:
			return jsonify({'error': 'Workflow not found'}), 404
		
		# Update fields
		if 'name' in data:
			# Check if new name conflicts with existing workflow
			existing_workflow = Workflow.query.filter_by(name=data['name']).first()
			if existing_workflow and existing_workflow.id != workflow_id:
				return jsonify({'error': 'Workflow with this name already exists'}), 400
			workflow.name = data['name']
		
		if 'description' in data:
			workflow.description = data['description']
		
		if 'agent_sequence' in data:
			import json
			workflow.agent_sequence = json.dumps(data['agent_sequence'])
			# If agent_models/agent_temperatures are absent, align size with sequence
			if 'agent_models' not in data:
				workflow.agent_models = json.dumps([None] * len(data['agent_sequence']))
			if 'agent_temperatures' not in data:
				workflow.agent_temperatures = json.dumps([None] * len(data['agent_sequence']))
		
		if 'agent_models' in data:
			import json
			workflow.agent_models = json.dumps(data['agent_models'])
		
		if 'agent_temperatures' in data:
			import json
			workflow.agent_temperatures = json.dumps(data['agent_temperatures'])
		
		if 'is_active' in data:
			workflow.is_active = data['is_active']
		
		workflow.updated_at = datetime.utcnow()
		db.session.commit()
		
		logger.info(f"Updated workflow: {workflow.name}")
		
		return jsonify({
			'message': 'Workflow updated successfully',
			'workflow': workflow.to_dict()
		})
		
	except Exception as e:
		logger.error(f"Error updating workflow {workflow_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows/<workflow_id>', methods=['DELETE'])
@cross_origin()
def delete_workflow(workflow_id):
	"""Delete a workflow"""
	try:
		workflow = Workflow.query.get(workflow_id)
		
		if not workflow:
			return jsonify({'error': 'Workflow not found'}), 404
		
		if workflow.is_default:
			return jsonify({'error': 'Cannot delete default workflow'}), 400
		
		# Soft delete by setting is_active to False
		workflow.is_active = False
		workflow.updated_at = datetime.utcnow()
		db.session.commit()
		
		logger.info(f"Deleted workflow: {workflow.name}")
		
		return jsonify({'message': 'Workflow deleted successfully'})
		
	except Exception as e:
		logger.error(f"Error deleting workflow {workflow_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows/<workflow_id>/copy', methods=['POST'])
@cross_origin()
def copy_workflow(workflow_id):
	"""Copy a workflow"""
	try:
		_ensure_workflows_schema()
		data = request.get_json()
		
		if not data or 'name' not in data:
			return jsonify({'error': 'New workflow name is required'}), 400
		
		original_workflow = Workflow.query.get(workflow_id)
		
		if not original_workflow:
			return jsonify({'error': 'Workflow not found'}), 404
		
		# Check if new name already exists
		existing_workflow = Workflow.query.filter_by(name=data['name']).first()
		if existing_workflow:
			return jsonify({'error': 'Workflow with this name already exists'}), 400
		
		# Create copy
		import uuid
		new_workflow = Workflow(
			id=str(uuid.uuid4()),
			name=data['name'],
			description=data.get('description', f"Copy of {original_workflow.name}"),
			agent_sequence=original_workflow.agent_sequence,  # Copy the agent sequence
			agent_models=getattr(original_workflow, 'agent_models', None),
			agent_temperatures=getattr(original_workflow, 'agent_temperatures', None),
			is_default=False,
			is_active=True,
			created_by='user'
		)
		
		db.session.add(new_workflow)
		db.session.commit()
		
		logger.info(f"Copied workflow {original_workflow.name} to {new_workflow.name}")
		
		return jsonify({
			'message': 'Workflow copied successfully',
			'workflow': new_workflow.to_dict()
		}), 201
		
	except Exception as e:
		logger.error(f"Error copying workflow {workflow_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/workflows/default', methods=['GET'])
@cross_origin()
def get_default_workflow():
	"""Get the default workflow sequence"""
	try:
		_ensure_workflows_schema()
		default_workflow = Workflow.get_default_workflow()
		
		if default_workflow:
			wf = default_workflow.to_dict()
			return jsonify({
				'workflow_sequence': wf['agent_sequence'],
				'agent_models': wf.get('agent_models', []),
				'agent_temperatures': wf.get('agent_temperatures', []),
				'available_agents': agent_manager.get_agent_names()
			})
		else:
			# Fallback to agent manager default
			return jsonify({
				'workflow_sequence': agent_manager.get_default_workflow_sequence(),
				'agent_models': [],
				'agent_temperatures': [],
				'available_agents': agent_manager.get_agent_names()
			})
	except Exception as e:
		logger.error(f"Error getting default workflow: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Usage Statistics
@adaptive_system_bp.route('/api/usage/summary', methods=['GET'])
@cross_origin()
def get_usage_summary():
	"""Get usage statistics summary"""
	try:
		summary = token_meter.get_usage_summary()
		return jsonify(summary)
		
	except Exception as e:
		logger.error(f"Error getting usage summary: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# File Upload
@adaptive_system_bp.route('/api/upload', methods=['POST'])
@cross_origin()
def upload_file():
	"""Upload and process a file"""
	try:
		if 'file' not in request.files:
			return jsonify({'error': 'No file provided'}), 400
		
		file = request.files['file']
		
		if file.filename == '':
			return jsonify({'error': 'No file selected'}), 400
		
		if not allowed_file(file.filename):
			return jsonify({'error': 'File type not allowed'}), 400
		
		# Save file
		filename = secure_filename(file.filename)
		file_path = os.path.join(UPLOAD_FOLDER, filename)
		file.save(file_path)
		
		# Process file
		try:
			parsed_content = file_parser.parse_file(file_path)
			
			return jsonify({
				'filename': filename,
				'file_path': file_path,
				'content': parsed_content,
				'message': 'File uploaded and processed successfully'
			})
			
		except Exception as parse_error:
			logger.error(f"Error parsing file {filename}: {parse_error}")
			return jsonify({
				'filename': filename,
				'file_path': file_path,
				'error': f'File uploaded but parsing failed: {str(parse_error)}'
			}), 206  # Partial content
		
	except Exception as e:
		logger.error(f"Error uploading file: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/tasks/<task_id>/upload', methods=['POST'])
@cross_origin()
def upload_file_for_task(task_id):
	"""Upload a file and place it into the task's .sureai/uploads directory, then parse it."""
	try:
		if 'file' not in request.files:
			return jsonify({'error': 'No file provided'}), 400
		
		file = request.files['file']
		
		if file.filename == '':
			return jsonify({'error': 'No file selected'}), 400
		
		if not allowed_file(file.filename):
			return jsonify({'error': 'File type not allowed'}), 400
		
		project_dir = task_manager.get_task_output_directory(task_id)
		if not project_dir:
			return jsonify({'error': 'Invalid task ID'}), 404
		
		uploads_dir = os.path.join(project_dir, '.sureai', 'uploads')
		os.makedirs(uploads_dir, exist_ok=True)
		
		filename = secure_filename(file.filename)
		dest_path = os.path.join(uploads_dir, filename)
		if os.path.exists(dest_path):
			name, ext = os.path.splitext(filename)
			counter = 1
			while os.path.exists(dest_path):
				alt = f"{name}({counter}){ext}"
				dest_path = os.path.join(uploads_dir, alt)
				counter += 1
		file.save(dest_path)
		
		try:
			parsed_content = file_parser.parse_file(dest_path)
		except Exception as parse_error:
			logger.warning(f"Parsing failed for {dest_path}: {parse_error}")
			parsed_content = None
		
		# Append an entry to a manifest file for traceability
		try:
			manifest_path = os.path.join(project_dir, '.sureai', 'uploads_manifest.json')
			manifest = []
			if os.path.exists(manifest_path):
				with open(manifest_path, 'r', encoding='utf-8') as f:
					manifest = json.load(f)
			manifest.append({
				'filename': filename,
				'path': os.path.relpath(dest_path, project_dir),
				'uploaded_at': datetime.utcnow().isoformat(),
				'parsed': parsed_content is not None
			})
			with open(manifest_path, 'w', encoding='utf-8') as f:
				json.dump(manifest, f, indent=2)
		except Exception as mf_err:
			logger.warning(f"Could not update uploads manifest: {mf_err}")
		
		return jsonify({
			'task_id': task_id,
			'filename': os.path.basename(dest_path),
			'relative_path': os.path.relpath(dest_path, project_dir),
			'content': parsed_content,
			'message': 'File uploaded to task and processed successfully' if parsed_content is not None else 'File uploaded to task; parsing failed'
		})
	except Exception as e:
		logger.error(f"Error uploading file for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Task Logs
@adaptive_system_bp.route('/api/tasks/<task_id>/logs', methods=['GET'])
@cross_origin()
def get_task_logs(task_id):
	"""Get logs for a specific task"""
	try:
		logs = get_task_logs(task_id)
		return jsonify({'logs': logs})
		
	except Exception as e:
		logger.error(f"Error getting logs for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Download Task Results
@adaptive_system_bp.route('/api/tasks/<task_id>/download', methods=['GET'])
@cross_origin()
def download_task_results(task_id):
	"""Download task results as a zip file"""
	try:
		# Get task output directory
		output_dir = task_manager.get_task_output_directory(task_id)
		
		if not output_dir or not os.path.exists(output_dir):
			return jsonify({'error': 'Task results not found'}), 404
		
		# Create zip file
		import zipfile
		import tempfile
		
		with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
			with zipfile.ZipFile(tmp_file.name, 'w') as zip_file:
				for root, dirs, files in os.walk(output_dir):
					for file in files:
						file_path = os.path.join(root, file)
						arc_name = os.path.relpath(file_path, output_dir)
						zip_file.write(file_path, arc_name)
			
			return send_file(
				tmp_file.name,
				as_attachment=True,
				download_name=f'task_{task_id}_results.zip',
				mimetype='application/zip'
			)
		
	except Exception as e:
		logger.error(f"Error downloading task results for {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Download Generated Project
@adaptive_system_bp.route('/api/tasks/<task_id>/project', methods=['GET'])
@cross_origin()
def download_generated_project(task_id):
	"""Download generated project files as a zip file"""
	try:
		project_dir = os.path.join(tempfile.gettempdir(), 'adaptive_system_projects', task_id)
		
		if not os.path.exists(project_dir):
			return jsonify({'error': 'Generated project not found'}), 404
		
		# Create zip file
		import zipfile
		zip_path = os.path.join(tempfile.gettempdir(), 'adaptive_system_projects', f"{task_id}_project.zip")
		
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			for root, dirs, files in os.walk(project_dir):
				for file in files:
					file_path = os.path.join(root, file)
					arcname = os.path.relpath(file_path, project_dir)
					zipf.write(file_path, arcname)
		
		return send_file(zip_path, as_attachment=True, download_name=f"{task_id}_project.zip")
		
	except Exception as e:
		logger.error(f"Error downloading project for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Get Project Status
@adaptive_system_bp.route('/api/tasks/<task_id>/project/status', methods=['GET'])
@cross_origin()
def get_project_status(task_id):
	"""Get the status of generated project"""
	try:
		project_dir = os.path.join(tempfile.gettempdir(), 'adaptive_system_projects', task_id)
		
		if not os.path.exists(project_dir):
			return jsonify({'status': 'not_generated'})
		
		# Count files
		file_count = 0
		for root, dirs, files in os.walk(project_dir):
			file_count += len(files)
		
		return jsonify({
			'status': 'generated',
			'project_dir': project_dir,
			'file_count': file_count,
			'files': [f for f in os.listdir(project_dir) if os.path.isfile(os.path.join(project_dir, f))]
		})
		
	except Exception as e:
		logger.error(f"Error getting project status for task {task_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# MCP Management
@adaptive_system_bp.route('/api/mcp/servers', methods=['GET'])
@cross_origin()
def list_mcp_servers():
	try:
		servers = MCPServer.query.order_by(MCPServer.created_at.desc()).all()
		try:
			gemini_cli_client.set_mcp_servers([s.to_dict() for s in servers if s.enabled])
		except Exception:
			pass
		return jsonify({'servers': [s.to_dict() for s in servers]})
	except Exception as e:
		logger.error(f"Error listing MCP servers: {e}")
		return jsonify({'error': 'Internal server error'}), 500

def _gemini_settings_path() -> Path:
	# Gemini CLI stores state under ~/.gemini; use settings.json there
	home = Path(os.environ.get('HOME', '/root'))
	return home.joinpath('.gemini', 'settings.json')

def _ensure_settings_dir(path: Path):
	try:
		path.parent.mkdir(parents=True, exist_ok=True)
	except Exception as e:
		logger.warning(f"Could not create settings dir {path.parent}: {e}")

def _read_settings() -> Dict[str, Any]:
	path = _gemini_settings_path()
	try:
		if path.exists():
			with open(path, 'r', encoding='utf-8') as f:
				return json.load(f)
	except Exception as e:
		logger.warning(f"Failed to read settings.json: {e}")
	return {}

def _deep_merge(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
	out = dict(a or {})
	for k, v in (b or {}).items():
		if isinstance(v, dict) and isinstance(out.get(k), dict):
			out[k] = _deep_merge(out[k], v)
		else:
			out[k] = v
	return out

def _write_settings(data: Dict[str, Any]) -> bool:
	path = _gemini_settings_path()
	_ensure_settings_dir(path)
	try:
		with open(path, 'w', encoding='utf-8') as f:
			json.dump(data, f, indent=2)
		return True
	except Exception as e:
		logger.error(f"Failed to write settings.json: {e}")
		return False

def _ensure_default_context7_mcp_installed():
	"""Best-effort: ensure Context7 MCP server is present in Gemini settings.json.
	Uses HTTP transport per provided configuration.
	"""
	try:
		desired = {
			"mcpServers": {
				"context7": {
					"type": "streamable-http",
					"url": "http://157.66.191.31:4003/mcp"
				}
			}
		}
		current = _read_settings()
		merged = _deep_merge(current, desired)
		if merged != current:
			if _write_settings(merged):
				logger.info("Preinstalled Context7 MCP in Gemini settings.json")
				try:
					# Clear explicit CLI MCP flags to rely on settings.json
					gemini_cli_client.set_mcp_servers([])
				except Exception:
					pass
		else:
			logger.info("Context7 MCP already present in Gemini settings.json")
	except Exception as e:
		logger.warning(f"Could not preinstall Context7 MCP: {e}")

# MCP Management
@adaptive_system_bp.route('/api/mcp/settings', methods=['GET'])
@cross_origin()
def get_mcp_settings():
	try:
		settings = _read_settings()
		return jsonify({'settings': settings})
	except Exception as e:
		logger.error(f"Error reading MCP settings: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/settings', methods=['PUT'])
@cross_origin()
def update_mcp_settings():
	"""Merge the provided JSON into Gemini CLI settings.json (append mcpServers etc.)."""
	try:
		payload = request.get_json() or {}
		if not isinstance(payload, dict):
			return jsonify({'error': 'JSON body must be an object'}), 400
		# Normalize: support payloads that omit the mcpServers block
		single_server_mode = False
		if 'mcpServers' not in payload:
			# Case A: payload looks like a servers map {name: {url|command...}, ...}
			if payload and all(isinstance(v, dict) for v in payload.values()):
				payload = {'mcpServers': payload}
			# Case B: payload looks like a single server object; require serverName query param
			elif any(k in payload for k in ['url', 'command', 'args', 'env']):
				server_name = request.args.get('serverName')
				if not server_name:
					return jsonify({'error': 'For single server JSON, provide ?serverName=<name>'}), 400
				payload = {'mcpServers': {server_name: payload}}
				single_server_mode = True
		# Validate mcpServers entries
		warnings: List[str] = []
		valid_servers: Dict[str, Any] = {}
		servers = (payload.get('mcpServers') or {}) if isinstance(payload.get('mcpServers'), dict) else {}
		for name, cfg in servers.items():
			if not isinstance(cfg, dict):
				warnings.append(f"{name}: configuration must be an object")
				continue
			has_url = isinstance(cfg.get('url'), str) and cfg.get('url').strip() != ''
			has_cmd = isinstance(cfg.get('command'), str) and cfg.get('command').strip() != ''
			if not has_url and not has_cmd:
				warnings.append(f"{name}: must provide either 'url' (SSE/HTTP) or 'command' (STDIO)")
				continue
			# Validate URL format if present
			if has_url and not (cfg['url'].startswith('http://') or cfg['url'].startswith('https://')):
				warnings.append(f"{name}: url should start with http:// or https://")
				# still accept
			# Validate args/env types for STDIO
			if has_cmd:
				if 'args' in cfg and not isinstance(cfg['args'], list):
					warnings.append(f"{name}: 'args' must be an array; ignoring provided value")
					cfg = {**cfg}
					cfg.pop('args', None)
				if 'env' in cfg and not isinstance(cfg['env'], dict):
					warnings.append(f"{name}: 'env' must be an object; ignoring provided value")
					cfg = {**cfg}
					cfg.pop('env', None)
			valid_servers[name] = cfg
		# If user provided only invalid servers, error out
		if servers and not valid_servers:
			return jsonify({'error': 'No valid MCP servers found in payload', 'warnings': warnings}), 400
		# Build merge payload: keep other top-level keys (e.g., theme) but replace mcpServers with validated set
		payload_for_merge = dict(payload)
		if servers:
			payload_for_merge['mcpServers'] = valid_servers
		current = _read_settings()
		merged = _deep_merge(current, payload_for_merge)
		ok = _write_settings(merged)
		if not ok:
			return jsonify({'error': 'Failed to write settings'}), 500
		# Since settings.json drives MCP, clear explicit CLI MCP flags to avoid conflicts
		try:
			gemini_cli_client.set_mcp_servers([])
		except Exception:
			pass
		msg = 'Settings updated'
		if warnings:
			msg += ' with warnings'
		return jsonify({'message': msg, 'settings': merged, 'warnings': warnings})
	except Exception as e:
		logger.error(f"Error updating MCP settings: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/servers', methods=['POST'])
@cross_origin()
def create_mcp_server():
	try:
		data = request.get_json() or {}
		name = data.get('name')
		command = data.get('command')
		args = data.get('args') or []
		env = data.get('env') or {}
		enabled = bool(data.get('enabled', True))
		if not name or not command:
			return jsonify({'error': 'name and command are required'}), 400
		import uuid, json
		server = MCPServer(
			id=str(uuid.uuid4()),
			name=name,
			command=command,
			args=json.dumps(args),
			env=json.dumps(env),
			enabled=enabled
		)
		db.session.add(server)
		db.session.commit()
		try:
			all_servers = MCPServer.query.all()
			gemini_cli_client.set_mcp_servers([s.to_dict() for s in all_servers if s.enabled])
		except Exception:
			pass
		return jsonify({'message': 'MCP server created', 'server': server.to_dict()}), 201
	except Exception as e:
		logger.error(f"Error creating MCP server: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/servers/<server_id>', methods=['PUT'])
@cross_origin()
def update_mcp_server(server_id):
	try:
		data = request.get_json() or {}
		server = MCPServer.query.get(server_id)
		if not server:
			return jsonify({'error': 'MCP server not found'}), 404
		import json
		if 'name' in data:
			server.name = data['name']
		if 'command' in data:
			server.command = data['command']
		if 'args' in data:
			server.args = json.dumps(data['args'] or [])
		if 'env' in data:
			server.env = json.dumps(data['env'] or {})
		if 'enabled' in data:
			server.enabled = bool(data['enabled'])
		server.updated_at = datetime.utcnow()
		db.session.commit()
		try:
			all_servers = MCPServer.query.all()
			gemini_cli_client.set_mcp_servers([s.to_dict() for s in all_servers if s.enabled])
		except Exception:
			pass
		return jsonify({'message': 'MCP server updated', 'server': server.to_dict()})
	except Exception as e:
		logger.error(f"Error updating MCP server {server_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/servers/<server_id>', methods=['DELETE'])
@cross_origin()
def delete_mcp_server(server_id):
	try:
		server = MCPServer.query.get(server_id)
		if not server:
			return jsonify({'error': 'MCP server not found'}), 404
		db.session.delete(server)
		db.session.commit()
		try:
			all_servers = MCPServer.query.all()
			gemini_cli_client.set_mcp_servers([s.to_dict() for s in all_servers if s.enabled])
		except Exception:
			pass
		return jsonify({'message': 'MCP server deleted'})
	except Exception as e:
		logger.error(f"Error deleting MCP server {server_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/servers/<server_id>/test', methods=['POST'])
@cross_origin()
def test_mcp_server(server_id):
	"""Registers the MCP server with Gemini CLI for this process and lists available tools."""
	try:
		server = MCPServer.query.get(server_id)
		if not server:
			return jsonify({'error': 'MCP server not found'}), 404
		import subprocess, json, os
		env = os.environ.copy()
		try:
			supplied_env = server.to_dict().get('env') or {}
		except Exception:
			supplied_env = {}
		env.update({k: str(v) for k, v in (supplied_env or {}).items()})
		# Build the gemini CLI command to register MCP server and list tools
		# Note: Assuming gemini CLI supports MCP via flags like: --mcp <name>=<command> [args]
		# And a command to list tools (hypothetical: gemini tools list)
		mcp_spec = server.to_dict()
		cmd = ['gemini', '--yolo', '--model', gemini_cli_client.get_model_info().get('model_name', 'gemini-2.5-flash'), f"--mcp={mcp_spec['name']}={mcp_spec['command']}"]
		args = mcp_spec.get('args') or []
		for a in args:
			cmd.append(str(a))
		# Try a lightweight tools list; fall back to a ping prompt
		try:
			tools_proc = subprocess.run(['gemini', 'tools', 'list'], capture_output=True, text=True, env=env, timeout=10)
			tools_out = tools_proc.stdout.strip() or tools_proc.stderr.strip()
		except Exception:
			tools_out = ''
		# Simple ping to confirm server registers in a run
		test_proc = subprocess.run(cmd + ["Ping MCP server and respond with 'OK'"], capture_output=True, text=True, env=env, timeout=30)
		output = (test_proc.stdout or '').strip() or (test_proc.stderr or '').strip()
		return jsonify({'message': 'MCP test executed', 'tools': tools_out, 'output': output, 'return_code': test_proc.returncode})
	except Exception as e:
		logger.error(f"Error testing MCP server {server_id}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/settings/servers', methods=['GET'])
@cross_origin()
def list_settings_mcp_servers():
	try:
		settings = _read_settings()
		servers = settings.get('mcpServers') or {}
		if not isinstance(servers, dict):
			servers = {}
		items = []
		for name, cfg in servers.items():
			if isinstance(cfg, dict):
				items.append({'name': name, 'config': cfg})
		return jsonify({'servers': items})
	except Exception as e:
		logger.error(f"Error listing settings MCP servers: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/settings/servers/<name>', methods=['PUT'])
@cross_origin()
def update_settings_mcp_server(name: str):
	try:
		body = request.get_json() or {}
		if not isinstance(body, dict):
			return jsonify({'error': 'Server config must be an object'}), 400
		settings = _read_settings()
		servers = settings.get('mcpServers') or {}
		if not isinstance(servers, dict):
			servers = {}
		servers[name] = body
		settings['mcpServers'] = servers
		if not _write_settings(settings):
			return jsonify({'error': 'Failed to write settings'}), 500
		try:
			gemini_cli_client.set_mcp_servers([])
		except Exception:
			pass
		return jsonify({'message': 'Server updated', 'server': {'name': name, 'config': body}})
	except Exception as e:
		logger.error(f"Error updating settings MCP server {name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

@adaptive_system_bp.route('/api/mcp/settings/servers/<name>', methods=['DELETE'])
@cross_origin()
def delete_settings_mcp_server(name: str):
	try:
		settings = _read_settings()
		servers = settings.get('mcpServers') or {}
		if isinstance(servers, dict) and name in servers:
			del servers[name]
			settings['mcpServers'] = servers
			if not _write_settings(settings):
				return jsonify({'error': 'Failed to write settings'}), 500
			try:
				gemini_cli_client.set_mcp_servers([])
			except Exception:
				pass
			return jsonify({'message': 'Server deleted'})
		return jsonify({'error': 'Server not found'}), 404
	except Exception as e:
		logger.error(f"Error deleting settings MCP server {name}: {e}")
		return jsonify({'error': 'Internal server error'}), 500

# Ensure default Context7 MCP is present at import time (best-effort)
try:
	_ensure_default_context7_mcp_installed()
except Exception as _e:
	logger.warning(f"Context7 MCP bootstrap failed: {_e}")

