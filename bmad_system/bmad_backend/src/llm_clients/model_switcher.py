"""
Model Switcher Module for BMAD System

This module implements logic to switch between different Gemini models based on 
task criticality or if one model fails to respond. It also manages input and 
output token metering.
"""

import asyncio
from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass
from src.llm_clients.gemini_api_client import GeminiAPIClient, GeminiResponse
from src.utils.logger import get_logger
from src.utils.token_meter import TokenMeter

logger = get_logger(__name__)

class TaskCriticality(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class TaskType(Enum):
    REASONING = "reasoning"
    CODING = "coding"
    ANALYSIS = "analysis"
    PLANNING = "planning"
    TESTING = "testing"

@dataclass
class ModelStrategy:
    """Defines model selection strategy"""
    primary_model: str
    fallback_models: List[str]
    max_retries: int = 2
    timeout_seconds: int = 30

class ModelSwitcher:
    """Manages model selection and switching logic"""
    
    def __init__(self):
        self.gemini_client = GeminiAPIClient()
        self.token_meter = TokenMeter()
        self.model_strategies = self._initialize_strategies()
        self.model_performance = {}  # Track model performance
        self.failed_models = set()  # Track temporarily failed models
        self.failure_reset_time = 300  # Reset failures after 5 minutes
    
    def _initialize_strategies(self) -> Dict[str, ModelStrategy]:
        # Creates predefined model selection strategies for different task types
        """Initialize model selection strategies"""
        return {
            # High-performance model for critical tasks
            "critical_reasoning": ModelStrategy(
                primary_model="gemini-1.5-pro",
                fallback_models=["gemini-1.5-flash", "gemini-1.0-pro"]
            ),
            
            # Fast model for coding tasks
            "coding": ModelStrategy(
                primary_model="gemini-1.5-flash",
                fallback_models=["gemini-1.5-pro", "gemini-1.0-pro"]
            ),
            
            # Balanced model for analysis
            "analysis": ModelStrategy(
                primary_model="gemini-1.5-pro",
                fallback_models=["gemini-1.5-flash", "gemini-1.0-pro"]
            ),
            
            # Fast model for planning
            "planning": ModelStrategy(
                primary_model="gemini-1.5-flash",
                fallback_models=["gemini-1.5-pro", "gemini-1.0-pro"]
            ),
            
            # Reliable model for testing
            "testing": ModelStrategy(
                primary_model="gemini-1.0-pro",
                fallback_models=["gemini-1.5-flash", "gemini-1.5-pro"]
            ),
            
            # Default strategy
            "default": ModelStrategy(
                primary_model="gemini-1.5-pro",
                fallback_models=["gemini-1.5-flash", "gemini-1.0-pro"]
            )
        }
    
    def select_strategy(self, task_type: TaskType, criticality: TaskCriticality) -> str:
        # Selects appropriate model strategy based on task type and criticality level
        """
        Select appropriate strategy based on task type and criticality
        
        Args:
            task_type: Type of task being performed
            criticality: Criticality level of the task
            
        Returns:
            Strategy name
        """
        # For critical tasks, always use critical_reasoning
        if criticality == TaskCriticality.CRITICAL:
            return "critical_reasoning"
        
        # Map task types to strategies
        strategy_map = {
            TaskType.REASONING: "critical_reasoning" if criticality == TaskCriticality.HIGH else "analysis",
            TaskType.CODING: "coding",
            TaskType.ANALYSIS: "analysis",
            TaskType.PLANNING: "planning",
            TaskType.TESTING: "testing"
        }
        
        return strategy_map.get(task_type, "default")
    
    async def generate_with_fallback(self, prompt: str, task_id: str,
                                   task_type: TaskType = TaskType.REASONING,
                                   criticality: TaskCriticality = TaskCriticality.MEDIUM,
                                   **kwargs) -> Optional[GeminiResponse]:
        """
        Generate response with automatic model fallback
        
        Args:
            prompt: Input prompt
            task_id: Task identifier
            task_type: Type of task
            criticality: Task criticality level
            **kwargs: Additional arguments for generation
            
        Returns:
            GeminiResponse or None if all models fail
        """
        strategy_name = self.select_strategy(task_type, criticality)
        strategy = self.model_strategies[strategy_name]
        
        # Try primary model first
        models_to_try = [strategy.primary_model] + strategy.fallback_models
        
        for model in models_to_try:
            # Skip models that have recently failed
            if model in self.failed_models:
                logger.info(f"Skipping failed model {model}")
                continue
            
            try:
                logger.info(f"Attempting generation with model {model} for task {task_id}")
                
                response = await asyncio.wait_for(
                    self.gemini_client.generate_response(
                        prompt=prompt,
                        task_id=task_id,
                        model=model,
                        **kwargs
                    ),
                    timeout=strategy.timeout_seconds
                )
                
                if response:
                    # Track successful generation
                    self._track_success(model, task_type)
                    logger.info(f"Successfully generated response with model {model}")
                    return response
                
            except asyncio.TimeoutError:
                logger.warning(f"Model {model} timed out for task {task_id}")
                self._track_failure(model, "timeout")
            except Exception as e:
                logger.error(f"Model {model} failed for task {task_id}: {e}")
                self._track_failure(model, str(e))
        
        logger.error(f"All models failed for task {task_id}")
        return None
    
    def _track_success(self, model: str, task_type: TaskType):
        # Records successful model usage and removes from failed models list
        """Track successful model usage"""
        if model not in self.model_performance:
            self.model_performance[model] = {
                'successes': 0,
                'failures': 0,
                'task_types': {}
            }
        
        self.model_performance[model]['successes'] += 1
        
        task_type_str = task_type.value
        if task_type_str not in self.model_performance[model]['task_types']:
            self.model_performance[model]['task_types'][task_type_str] = {'successes': 0, 'failures': 0}
        
        self.model_performance[model]['task_types'][task_type_str]['successes'] += 1
        
        # Remove from failed models if it was there
        self.failed_models.discard(model)
    
    def _track_failure(self, model: str, error: str):
        # Records model failure and adds to temporary failed models list
        """Track model failure"""
        if model not in self.model_performance:
            self.model_performance[model] = {
                'successes': 0,
                'failures': 0,
                'task_types': {},
                'last_error': None
            }
        
        self.model_performance[model]['failures'] += 1
        self.model_performance[model]['last_error'] = error
        
        # Add to failed models temporarily
        self.failed_models.add(model)
        
        # Schedule removal from failed models
        asyncio.create_task(self._reset_model_failure(model))
    
    async def _reset_model_failure(self, model: str):
        # Removes model from failed list after timeout period for retry
        """Reset model failure status after timeout"""
        await asyncio.sleep(self.failure_reset_time)
        self.failed_models.discard(model)
        logger.info(f"Reset failure status for model {model}")
    
    def get_model_performance(self) -> Dict[str, Any]:
        # Returns performance statistics for all models including success rates
        """Get performance statistics for all models"""
        performance = {}
        
        for model, stats in self.model_performance.items():
            total_requests = stats['successes'] + stats['failures']
            success_rate = stats['successes'] / total_requests if total_requests > 0 else 0
            
            performance[model] = {
                'success_rate': success_rate,
                'total_requests': total_requests,
                'successes': stats['successes'],
                'failures': stats['failures'],
                'currently_failed': model in self.failed_models,
                'last_error': stats.get('last_error'),
                'task_performance': stats['task_types']
            }
        
        return performance
    
    def get_best_model_for_task(self, task_type: TaskType) -> str:
        # Returns best performing model for specific task type based on success rates
        """Get the best performing model for a specific task type"""
        best_model = None
        best_rate = 0
        
        for model, stats in self.model_performance.items():
            if model in self.failed_models:
                continue
            
            task_type_str = task_type.value
            if task_type_str in stats['task_types']:
                task_stats = stats['task_types'][task_type_str]
                total = task_stats['successes'] + task_stats['failures']
                if total > 0:
                    rate = task_stats['successes'] / total
                    if rate > best_rate:
                        best_rate = rate
                        best_model = model
        
        # Fallback to strategy default if no performance data
        if not best_model:
            strategy_name = self.select_strategy(task_type, TaskCriticality.MEDIUM)
            best_model = self.model_strategies[strategy_name].primary_model
        
        return best_model
    
    async def health_check(self) -> Dict[str, Any]:
        # Tests all available models to check their health and availability
        """Perform health check on all available models"""
        health_status = {}
        
        for model in self.gemini_client.available_models:
            try:
                # Switch to the model temporarily
                original_model = self.gemini_client.default_model
                await self.gemini_client.switch_model(model)
                
                # Test with a simple prompt
                response = await asyncio.wait_for(
                    self.gemini_client.generate_response(
                        prompt="Respond with 'OK' if you can process this message.",
                        task_id="health_check",
                        max_tokens=10
                    ),
                    timeout=10
                )
                
                health_status[model] = {
                    'status': 'healthy' if response else 'unhealthy',
                    'response_received': bool(response),
                    'currently_failed': model in self.failed_models
                }
                
                # Restore original model
                await self.gemini_client.switch_model(original_model)
                
            except Exception as e:
                health_status[model] = {
                    'status': 'error',
                    'error': str(e),
                    'currently_failed': model in self.failed_models
                }
        
        return health_status
    
    def update_strategy(self, strategy_name: str, strategy: ModelStrategy):
        # Updates or adds new model strategy for dynamic configuration
        """Update or add a model strategy"""
        self.model_strategies[strategy_name] = strategy
        logger.info(f"Updated strategy {strategy_name}")
    
    def reset_performance_stats(self):
        # Clears all performance statistics and failed models for fresh start
        """Reset all model performance statistics"""
        self.model_performance = {}
        self.failed_models = set()
        logger.info("Reset all model performance statistics")

