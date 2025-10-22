"""
Token Meter Utility Module for Adaptive System

This module provides token tracking and metering functionality for managing
usage limits and costs across different Gemini models.
"""

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from src.utils.logger import get_logger

logger = get_logger(__name__)

@dataclass
class TokenUsage:
    """Represents token usage for a single request"""
    timestamp: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost: float
    task_id: str
    
    def __post_init__(self):
        if self.total_tokens == 0:
            self.total_tokens = self.input_tokens + self.output_tokens

@dataclass
class DailyUsage:
    """Represents daily token usage summary"""
    date: str
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    request_count: int = 0
    tasks: Dict[str, int] = None
    models: Dict[str, int] = None
    
    def __post_init__(self):
        if self.tasks is None:
            self.tasks = {}
        if self.models is None:
            self.models = {}
        if self.total_tokens == 0:
            self.total_tokens = self.total_input_tokens + self.total_output_tokens

class TokenMeter:
    """Manages token usage tracking and limits"""
    
    def __init__(self):
        self.usage_file = "/tmp/adaptive_system_token_usage.json"
        self.model_costs = {
            # Costs per 1K tokens (estimated, adjust based on actual pricing)
            "gemini-2.5-flash": {"input": 0.00035, "output": 0.00105},  # Most cost-effective
            "gemini-2.5-pro": {"input": 0.0035, "output": 0.0105},      # Higher quality
            "gemini-1.5-pro": {"input": 0.0035, "output": 0.0105},
            "gemini-1.5-flash": {"input": 0.00035, "output": 0.00105},
            "gemini-1.0-pro": {"input": 0.0005, "output": 0.0015}
        }
        self.daily_limits = {
            "max_tokens_per_day": 1000000,  # 1M tokens per day
            "max_cost_per_day": 100.0,      # $100 per day
            "max_requests_per_day": 1000,   # 1000 requests per day
            "max_build_time_minutes": 60    # 60 minutes per day
        }
        self.usage_data = self._load_usage_data()
        self.build_time_tracking = {}  # Track build time per user/task
    
    def _get_timestamp(self) -> str:
        # Returns current timestamp in standardized format for logging
        """Get current timestamp string"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def _load_usage_data(self) -> Dict[str, Any]:
        # Loads usage data from JSON file and validates data structure
        """Load usage data from file"""
        try:
            if os.path.exists(self.usage_file):
                with open(self.usage_file, 'r') as f:
                    data = json.load(f)
                    # Validate data structure
                    if not isinstance(data, dict):
                        logger.error("Invalid usage data format")
                        return {"daily_usage": {}, "total_usage": {}, "build_times": {}}
                    
                    # Ensure required keys exist
                    if "daily_usage" not in data:
                        data["daily_usage"] = {}
                    if "total_usage" not in data:
                        data["total_usage"] = {}
                    if "build_times" not in data:
                        data["build_times"] = {}
                    
                    return data
            return {"daily_usage": {}, "total_usage": {}, "build_times": {}}
        except Exception as e:
            logger.error(f"Error loading usage data: {e}")
            return {"daily_usage": {}, "total_usage": {}, "build_times": {}}
    
    def _save_usage_data(self):
        # Persists usage data to JSON file for tracking across sessions
        """Save usage data to file"""
        try:
            with open(self.usage_file, 'w') as f:
                json.dump(self.usage_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving usage data: {e}")
    
    def track_usage(self, task_id: str, input_tokens: int, output_tokens: int, 
                   model: str) -> TokenUsage:
        """
        Track token usage for a request
        
        Args:
            task_id: Task identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            model: Model used
            
        Returns:
            TokenUsage object
        """
        try:
            timestamp = datetime.now().isoformat()
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Calculate cost
            cost = self._calculate_cost(input_tokens, output_tokens, model)
            
            # Create usage record
            usage = TokenUsage(
                timestamp=timestamp,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                estimated_cost=cost,
                task_id=task_id
            )
            
            # Update daily usage
            if today not in self.usage_data["daily_usage"]:
                self.usage_data["daily_usage"][today] = DailyUsage(date=today)
            
            daily = self.usage_data["daily_usage"][today]
            if isinstance(daily, dict):
                try:
                    daily = DailyUsage(**daily)
                    self.usage_data["daily_usage"][today] = daily
                except Exception as e:
                    logger.error(f"Error converting daily usage dict to DailyUsage: {e}")
                    # Create a new DailyUsage object
                    daily = DailyUsage(date=today)
                    self.usage_data["daily_usage"][today] = daily
            elif not isinstance(daily, DailyUsage):
                logger.error(f"Invalid daily usage type: {type(daily)}")
                daily = DailyUsage(date=today)
                self.usage_data["daily_usage"][today] = daily
            
            daily.total_input_tokens += input_tokens
            daily.total_output_tokens += output_tokens
            daily.total_tokens += input_tokens + output_tokens
            daily.total_cost += cost
            daily.request_count += 1
            
            # Track by task
            if task_id not in daily.tasks:
                daily.tasks[task_id] = 0
            daily.tasks[task_id] += input_tokens + output_tokens
            
            # Track by model
            if model not in daily.models:
                daily.models[model] = 0
            daily.models[model] += input_tokens + output_tokens
            
            # Update total usage
            if "total" not in self.usage_data["total_usage"]:
                self.usage_data["total_usage"]["total"] = {
                    "total_tokens": 0,
                    "total_cost": 0.0,
                    "total_requests": 0
                }
            
            total = self.usage_data["total_usage"]["total"]
            total["total_tokens"] += input_tokens + output_tokens
            total["total_cost"] += cost
            total["total_requests"] += 1
            
            # Convert DailyUsage back to dict for JSON serialization
            self.usage_data["daily_usage"][today] = asdict(daily)
            
            # Save to file
            self._save_usage_data()
            
            logger.info(f"Tracked usage: {input_tokens + output_tokens} tokens, ${cost:.4f} for task {task_id}")
            
            return usage
            
        except Exception as e:
            logger.error(f"Error tracking usage: {e}")
            return TokenUsage(
                timestamp=datetime.now().isoformat(),
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                estimated_cost=0.0,
                task_id=task_id
            )
    
    def _calculate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        # Calculates estimated cost based on token count and model pricing
        """Calculate estimated cost for token usage"""
        if model not in self.model_costs:
            logger.warning(f"Unknown model {model}, using default pricing")
            model = "gemini-2.5-flash"  # Default to most cost-effective
        
        costs = self.model_costs[model]
        input_cost = (input_tokens / 1000) * costs["input"]
        output_cost = (output_tokens / 1000) * costs["output"]
        
        return input_cost + output_cost
    
    def can_make_request(self, task_id: str, estimated_input_tokens: int) -> bool:
        """
        Check if a request can be made based on current usage limits
        
        Args:
            task_id: Task identifier
            estimated_input_tokens: Estimated input tokens for the request
            
        Returns:
            True if request can be made, False otherwise
        """
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Get today's usage
            if today in self.usage_data["daily_usage"]:
                daily = self.usage_data["daily_usage"][today]
                if isinstance(daily, dict):
                    daily = DailyUsage(**daily)
                
                # Check token limits
                if daily.total_tokens + estimated_input_tokens > self.daily_limits["max_tokens_per_day"]:
                    logger.warning(f"Token limit exceeded for task {task_id}")
                    return False
                
                # Check request limits
                if daily.request_count >= self.daily_limits["max_requests_per_day"]:
                    logger.warning(f"Request limit exceeded for task {task_id}")
                    return False
                
                # Check cost limits
                estimated_cost = self._calculate_cost(estimated_input_tokens, 0, "gemini-2.5-flash")
                if daily.total_cost + estimated_cost > self.daily_limits["max_cost_per_day"]:
                    logger.warning(f"Cost limit exceeded for task {task_id}")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking request limits: {e}")
            return True  # Allow request if there's an error checking limits
    
    def start_build_timer(self, task_id: str):
        # Initializes build timer for tracking task execution time
        """Start build timer for a task"""
        try:
            start_time = datetime.now()
            self.build_time_tracking[task_id] = {
                "start_time": start_time,
                "total_time": 0,
                "paused_time": 0,
                "is_paused": False
            }
            logger.info(f"Started build timer for task {task_id}")
        except Exception as e:
            logger.error(f"Error starting build timer: {e}")
    
    def pause_build_timer(self, task_id: str):
        # Pauses build timer when task is suspended
        """Pause build timer for a task"""
        try:
            if task_id in self.build_time_tracking:
                timer = self.build_time_tracking[task_id]
                if not timer["is_paused"]:
                    timer["paused_time"] = datetime.now()
                    timer["is_paused"] = True
                    logger.info(f"Paused build timer for task {task_id}")
        except Exception as e:
            logger.error(f"Error pausing build timer: {e}")
    
    def resume_build_timer(self, task_id: str):
        # Resumes build timer and adds pause duration to total time
        """Resume build timer for a task"""
        try:
            if task_id in self.build_time_tracking:
                timer = self.build_time_tracking[task_id]
                if timer["is_paused"]:
                    pause_duration = (datetime.now() - timer["paused_time"]).total_seconds()
                    timer["total_time"] += pause_duration
                    timer["is_paused"] = False
                    logger.info(f"Resumed build timer for task {task_id}")
        except Exception as e:
            logger.error(f"Error resuming build timer: {e}")
    
    def stop_build_timer(self, task_id: str) -> float:
        # Stops build timer and returns total execution time in minutes
        """Stop build timer and return total time in minutes"""
        try:
            if task_id in self.build_time_tracking:
                timer = self.build_time_tracking[task_id]
                end_time = datetime.now()
                
                if timer["is_paused"]:
                    # If paused, calculate total time up to pause
                    total_time = (timer["paused_time"] - timer["start_time"]).total_seconds()
                else:
                    # If not paused, calculate total time up to now
                    total_time = (end_time - timer["start_time"]).total_seconds()
                
                # Add any accumulated paused time
                total_time += timer["total_time"]
                
                # Convert to minutes
                total_minutes = total_time / 60
                
                logger.info(f"Stopped build timer for task {task_id}: {total_minutes:.2f} minutes")
                
                # Remove from tracking
                del self.build_time_tracking[task_id]
                
                return total_minutes
            
            return 0.0
            
        except Exception as e:
            logger.error(f"Error stopping build timer: {e}")
            return 0.0
    
    def can_continue_build_time(self, task_id: str) -> bool:
        # Checks if build time limit is exceeded for current task
        """Check if build time limit is exceeded"""
        try:
            if task_id in self.build_time_tracking:
                timer = self.build_time_tracking[task_id]
                current_time = datetime.now()
                
                if timer["is_paused"]:
                    total_time = (timer["paused_time"] - timer["start_time"]).total_seconds()
                else:
                    total_time = (current_time - timer["start_time"]).total_seconds()
                
                total_time += timer["total_time"]
                total_minutes = total_time / 60
                
                return total_minutes < self.daily_limits["max_build_time_minutes"]
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking build time: {e}")
            return True
    
    def get_daily_usage(self, date: str = None) -> DailyUsage:
        # Retrieves daily usage statistics for specific date or current date
        """Get daily usage for a specific date"""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        
        if date in self.usage_data["daily_usage"]:
            daily = self.usage_data["daily_usage"][date]
            if isinstance(daily, dict):
                return DailyUsage(**daily)
            elif isinstance(daily, DailyUsage):
                return daily
        
        return DailyUsage(date=date)
    
    def get_usage_summary(self, days: int = 7) -> Dict[str, Any]:
        # Aggregates usage statistics across multiple days for reporting
        """Get usage summary for the last N days"""
        try:
            summary = {
                "total_tokens": 0,
                "total_cost": 0.0,
                "total_requests": 0,
                "daily_breakdown": {}
            }
            
            for i in range(days):
                date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
                daily = self.get_daily_usage(date)
                
                summary["total_tokens"] += daily.total_tokens
                summary["total_cost"] += daily.total_cost
                summary["total_requests"] += daily.request_count
                summary["daily_breakdown"][date] = {
                    "tokens": daily.total_tokens,
                    "cost": daily.total_cost,
                    "requests": daily.request_count
                }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error getting usage summary: {e}")
            return {"error": str(e)}
    
    def get_task_usage(self, task_id: str) -> Dict[str, Any]:
        # Retrieves usage statistics for specific task across all days
        """Get usage statistics for a specific task"""
        try:
            task_usage = {
                "task_id": task_id,
                "total_tokens": 0,
                "total_cost": 0.0,
                "requests": 0,
                "models_used": {},
                "daily_breakdown": {}
            }
            
            # Search through all daily usage for this task
            for date, daily_data in self.usage_data["daily_usage"].items():
                if isinstance(daily_data, dict):
                    daily = DailyUsage(**daily_data)
                else:
                    daily = daily_data
                
                if task_id in daily.tasks:
                    task_tokens = daily.tasks[task_id]
                    task_usage["total_tokens"] += task_tokens
                    task_usage["requests"] += 1
                    
                    # Estimate cost for this task's tokens
                    estimated_cost = self._calculate_cost(task_tokens, 0, "gemini-2.5-flash")
                    task_usage["total_cost"] += estimated_cost
                    
                    task_usage["daily_breakdown"][date] = {
                        "tokens": task_tokens,
                        "estimated_cost": estimated_cost
                    }
            
            return task_usage
            
        except Exception as e:
            logger.error(f"Error getting task usage: {e}")
            return {"error": str(e)}
    
    def update_limits(self, new_limits: Dict[str, Any]):
        # Updates daily usage limits for tokens, cost, and requests
        """Update daily limits"""
        self.daily_limits.update(new_limits)
        logger.info(f"Updated daily limits: {new_limits}")
    
    def reset_daily_usage(self, date: str = None):
        # Clears usage data for specific date to reset daily limits
        """Reset daily usage for a specific date"""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        
        if date in self.usage_data["daily_usage"]:
            del self.usage_data["daily_usage"][date]
            self._save_usage_data()
            logger.info(f"Reset daily usage for {date}")
    
    def export_usage_data(self, file_path: str) -> bool:
        # Exports usage data to external file for backup or analysis
        """Export usage data to a file"""
        try:
            with open(file_path, 'w') as f:
                json.dump(self.usage_data, f, indent=2)
            logger.info(f"Exported usage data to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error exporting usage data: {e}")
            return False 