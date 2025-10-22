"""
Timeout Configuration for Adaptive System

This module contains timeout settings for different operations in the Adaptive System,
particularly for Gemini CLI operations that may take longer for complex tasks.
"""

# Gemini CLI timeout settings (in seconds)
GEMINI_CLI_TIMEOUTS = {
    'default': 300,      # 5 minutes for regular operations
    'retry': 600,        # 10 minutes for retry attempts (fallback window)
    'idle': 120,         # 2 minutes without output before we consider it stalled (if supported)
    'overall': 900,      # 15 minutes overall cap per agent call unless overridden
    'max_retries': 2,    # Default maximum number of retry attempts
}

# Agent-specific timeout configurations
AGENT_TIMEOUTS = {
    'directory_structure': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 90
    },
    'orchestrator': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 90
    },
    'analyst': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 120
    },
    'architect': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 120
    },
    'pm': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 120
    },
    'sm': {
        'timeout': 300,
        'retry_timeout': 600,
        'overall': 900,
        'max_retries': 1,
        'idle': 120
    },
    'developer': {
        'timeout': 420,   # First attempt window for code generation
        'retry_timeout': 600,  # Allow a longer second attempt
        'overall': 1200,  # Hard cap 20 minutes to avoid hanging forever
        'max_retries': 1,  # Only one retry to prevent 40+ minute stalls
        'idle': 150       # Allow a bit more idle time for file creation bursts
    },
    'devops': {
        'timeout': 420,
        'retry_timeout': 600,
        'overall': 1200,
        'max_retries': 1,
        'idle': 150
    },
    'tester': {
        'timeout': 420,  # Allow more time for reading codebase and generating tests
        'retry_timeout': 600,
        'overall': 1500,
        'max_retries': 2,
        'idle': 180
    },
    'web_search': {
        'timeout': 480,      # 8 minutes first attempt
        'retry_timeout': 600, # 10 minutes retry
        'overall': 1200,     # 20 minutes cap
        'max_retries': 1,    # One retry to avoid excessive waiting
        'idle': 150          # Allow brief idle gaps
    },
    'deep_research': {
        'timeout': 600,      # 10 minutes first attempt
        'retry_timeout': 900, # 15 minutes retry
        'overall': 1800,     # 30 minutes cap
        'max_retries': 1,    # Prefer one long retry instead of many short ones
        'idle': 180          # More idle time due to PDF generation and installs
    }
}

# Retry delay settings (in seconds)
RETRY_DELAYS = {
    'timeout': 5,        # 5 seconds delay after timeout
    'error': 3,          # 3 seconds delay after other errors
}

def get_agent_timeout_config(agent_name: str) -> dict:
    """
    Get timeout configuration for a specific agent
    
    Args:
        agent_name: Name of the agent
        
    Returns:
        Dictionary with timeout and retry parameters for the agent
    """
    base = {
        'timeout': GEMINI_CLI_TIMEOUTS['default'],
        'retry_timeout': GEMINI_CLI_TIMEOUTS['retry'],
        'overall': GEMINI_CLI_TIMEOUTS['overall'],
        'max_retries': GEMINI_CLI_TIMEOUTS['max_retries'],
        'idle': GEMINI_CLI_TIMEOUTS['idle']
    }
    base.update(AGENT_TIMEOUTS.get(agent_name, {}))
    return base

def get_retry_delay(error_type: str = 'error') -> int:
    """
    Get retry delay for a specific error type
    
    Args:
        error_type: Type of error ('timeout' or 'error')
        
    Returns:
        Delay in seconds
    """
    return RETRY_DELAYS.get(error_type, RETRY_DELAYS['error']) 