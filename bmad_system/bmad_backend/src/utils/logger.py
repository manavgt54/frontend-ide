"""
Logger Utility Module for Adaptive System

This module provides a centralized logging utility for capturing system events,
agent activities, and task progress. This is crucial for real-time logging to the frontend.
"""

import logging
import os
import sys
import io
from datetime import datetime
from typing import Dict, Any, Optional
from logging.handlers import RotatingFileHandler
import json

class AdaptiveSystemFormatter(logging.Formatter):
    """Custom formatter for Adaptive System logs"""
    
    def format(self, record):
        # Add timestamp
        record.timestamp = datetime.now().isoformat()
        
        # Add context if available
        if hasattr(record, 'task_id'):
            record.context = f"[Task: {record.task_id}]"
        elif hasattr(record, 'agent'):
            record.context = f"[Agent: {record.agent}]"
        else:
            record.context = "[System]"
        
        # Format the message
        formatted = f"{record.timestamp} - {record.context} - {record.levelname} - {record.getMessage()}"
        
        # Ensure the formatted string is safe for the active console encoding
        # This preserves emojis where possible and replaces only unencodable chars.
        try:
            target_encoding = getattr(sys.stdout, 'encoding', None) or 'utf-8'
            # Probe encode; if it fails, replace unencodable characters
            try:
                formatted.encode(target_encoding)
            except Exception:
                formatted = formatted.encode(target_encoding, errors='replace').decode(target_encoding, errors='replace')
        except Exception:
            # Never let logging crash due to encoding issues
            pass
        
        # Add exception info if present
        if record.exc_info:
            formatted += "\\n" + self.formatException(record.exc_info)
        
        return formatted

class TaskLogHandler(logging.Handler):
    """Custom handler for task-specific logging"""
    
    def __init__(self):
        super().__init__()
        self.task_logs = {}  # Store logs per task
        self.max_logs_per_task = 1000
    
    def emit(self, record):
        # Captures log records and stores them per task for retrieval
        try:
            task_id = getattr(record, 'task_id', 'system')
            
            if task_id not in self.task_logs:
                self.task_logs[task_id] = []
            
            # Format the record
            log_entry = {
                'timestamp': datetime.now().isoformat(),
                'level': record.levelname,
                'message': record.getMessage(),
                'module': record.module,
                'function': record.funcName,
                'line': record.lineno
            }
            
            # Add agent info if available
            if hasattr(record, 'agent'):
                log_entry['agent'] = record.agent
            
            # Add exception info if present
            if record.exc_info:
                log_entry['exception'] = self.format(record)
            
            # Store the log entry
            self.task_logs[task_id].append(log_entry)
            
            # Limit the number of logs per task
            if len(self.task_logs[task_id]) > self.max_logs_per_task:
                self.task_logs[task_id] = self.task_logs[task_id][-self.max_logs_per_task:]
        
        except Exception:
            self.handleError(record)
    
    def get_task_logs(self, task_id: str) -> list:
        # Returns all stored logs for specific task
        """Get logs for a specific task"""
        return self.task_logs.get(task_id, [])
    
    def get_recent_logs(self, task_id: str, limit: int = 50) -> list:
        # Returns recent logs for task with configurable limit
        """Get recent logs for a task"""
        logs = self.task_logs.get(task_id, [])
        return logs[-limit:] if logs else []
    
    def clear_task_logs(self, task_id: str):
        # Removes all stored logs for specific task to free memory
        """Clear logs for a specific task"""
        if task_id in self.task_logs:
            del self.task_logs[task_id]

# Global task log handler instance
task_log_handler = TaskLogHandler()

def setup_logging(log_level: str = "INFO", log_dir: str = "/tmp/adaptive_system_logs") -> logging.Logger:
    """
    Set up logging configuration for the Adaptive System
    
    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: Directory to store log files
        
    Returns:
        Configured logger instance
    """
    # Create log directory
    os.makedirs(log_dir, exist_ok=True)
    
    # Create main logger
    logger = logging.getLogger('adaptive_system')
    logger.setLevel(getattr(logging, log_level.upper()))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # On Windows, set console code page to UTF-8 for better emoji support
    try:
        if os.name == 'nt':
            import ctypes  # type: ignore
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass
    # Also hint Python's IO to use UTF-8
    os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

    # Console handler with UTF-8 safe stream
    console_stream = sys.stdout
    try:
        # Prefer reconfigure when available (Py3.7+)
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            console_stream = sys.stdout
        else:
            # Fallback to explicit TextIOWrapper with UTF-8 and replace
            console_stream = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        # As a last resort, wrap with cp1252 but replace unsupported chars
        try:
            console_stream = io.TextIOWrapper(sys.stdout.buffer, encoding="cp1252", errors="replace", line_buffering=True)
        except Exception:
            console_stream = sys.stdout

    console_handler = logging.StreamHandler(console_stream)
    console_handler.setLevel(logging.INFO)
    console_formatter = AdaptiveSystemFormatter()
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler with rotation
    log_file = os.path.join(log_dir, 'adaptive_system.log')
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_formatter = AdaptiveSystemFormatter()
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)
    
    # Add task-specific handler
    task_log_handler.setLevel(logging.DEBUG)
    logger.addHandler(task_log_handler)
    
    # Error file handler
    error_file = os.path.join(log_dir, 'adaptive_system_errors.log')
    error_handler = RotatingFileHandler(
        error_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=3,
        encoding='utf-8'
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(file_formatter)
    logger.addHandler(error_handler)
    
    logger.info("Adaptive System logging system initialized")
    return logger

def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a specific module
    
    Args:
        name: Name of the module/component
        
    Returns:
        Logger instance
    """
    # Get or create the main logger if it doesn't exist
    main_logger = logging.getLogger('adaptive_system')
    if not main_logger.handlers:
        setup_logging()
    
    # Create child logger
    logger = logging.getLogger(f'adaptive_system.{name}')
    return logger

class TaskLogger:
    """Context manager for task-specific logging"""
    
    def __init__(self, task_id: str, agent: str = None):
        self.task_id = task_id
        self.agent = agent
        self.logger = get_logger('task')
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.error(f"Exception in task {self.task_id}: {exc_val}")
    
    def _log(self, level: str, message: str, **kwargs):
        # Internal method that adds task context to log messages
        """Internal logging method"""
        extra = {'task_id': self.task_id}
        if self.agent:
            extra['agent'] = self.agent
        extra.update(kwargs)
        
        getattr(self.logger, level.lower())(message, extra=extra)
    
    def debug(self, message: str, **kwargs):
        self._log('DEBUG', message, **kwargs)
    
    def info(self, message: str, **kwargs):
        self._log('INFO', message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        self._log('WARNING', message, **kwargs)
    
    def error(self, message: str, **kwargs):
        self._log('ERROR', message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        self._log('CRITICAL', message, **kwargs)

class AgentLogger:
    """Logger specifically for agent activities"""
    
    def __init__(self, agent_name: str, task_id: str = None):
        self.agent_name = agent_name
        self.task_id = task_id
        self.logger = get_logger(f'agent.{agent_name}')
    
    def log_agent_start(self, task_description: str):
        # Logs when agent begins working on a task
        """Log when an agent starts working"""
        extra = {'agent': self.agent_name}
        if self.task_id:
            extra['task_id'] = self.task_id
        
        self.logger.info(
            f"Agent {self.agent_name} started: {task_description}",
            extra=extra
        )
    
    def log_agent_progress(self, progress_message: str, progress_percent: float = None):
        # Logs agent progress updates with optional percentage
        """Log agent progress"""
        extra = {'agent': self.agent_name}
        if self.task_id:
            extra['task_id'] = self.task_id
        if progress_percent is not None:
            extra['progress_percent'] = progress_percent
        
        self.logger.info(
            f"Agent {self.agent_name} progress: {progress_message}",
            extra=extra
        )
    
    def log_agent_complete(self, result_summary: str):
        # Logs when agent successfully completes a task
        """Log when an agent completes its task"""
        extra = {'agent': self.agent_name}
        if self.task_id:
            extra['task_id'] = self.task_id
        
        self.logger.info(
            f"Agent {self.agent_name} completed: {result_summary}",
            extra=extra
        )
    
    def log_agent_error(self, error_message: str, exception: Exception = None):
        # Logs agent errors with optional exception details
        """Log agent errors"""
        extra = {'agent': self.agent_name}
        if self.task_id:
            extra['task_id'] = self.task_id
        
        self.logger.error(
            f"Agent {self.agent_name} error: {error_message}",
            extra=extra,
            exc_info=exception
        )

def get_task_logs(task_id: str, limit: int = 50) -> list:
    """
    Get recent logs for a specific task
    
    Args:
        task_id: Task identifier
        limit: Maximum number of logs to return
        
    Returns:
        List of log entries
    """
    return task_log_handler.get_recent_logs(task_id, limit)

def get_all_task_logs(task_id: str) -> list:
    """
    Get all logs for a specific task
    
    Args:
        task_id: Task identifier
        
    Returns:
        List of all log entries for the task
    """
    return task_log_handler.get_task_logs(task_id)

def clear_task_logs(task_id: str):
    """
    Clear logs for a specific task
    
    Args:
        task_id: Task identifier
    """
    task_log_handler.clear_task_logs(task_id)

def export_task_logs(task_id: str, file_path: str) -> bool:
    """
    Export task logs to a file
    
    Args:
        task_id: Task identifier
        file_path: Path to export the logs
        
    Returns:
        True if export was successful, False otherwise
    """
    try:
        logs = get_all_task_logs(task_id)
        
        with open(file_path, 'w') as f:
            json.dump(logs, f, indent=2)
        
        return True
    except Exception as e:
        logger = get_logger('export')
        logger.error(f"Failed to export logs for task {task_id}: {e}")
        return False

# Initialize logging on module import
setup_logging()

