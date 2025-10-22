"""
Gemini API Client Module for Adaptive System

This module provides direct integration with the Gemini API for advanced functionalities.
It handles the bring-your-own-keys feature, allowing users to integrate their own Gemini keys.
"""

import os
import json
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from src.utils.logger import get_logger
from src.utils.token_meter import TokenMeter

logger = get_logger(__name__)

@dataclass
class GeminiResponse:
    """Represents a response from Gemini API"""
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    finish_reason: str
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

class GeminiAPIClient:
    """Client for interacting with Gemini API"""
    
    def __init__(self):
        self.api_key = self._load_api_key()
        self.token_meter = TokenMeter()
        self.available_models = [
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro"
        ]
        self.default_model = "gemini-2.5-flash"
        self.max_retries = 3
        self.retry_delay = 1.0
    
    def _load_api_key(self) -> Optional[str]:
        # Loads API key from environment variable or key files in order of priority
        """Load Gemini API key from environment or key file"""
        # First try environment variable
        api_key = os.getenv('GEMINI_API_KEY')
        if api_key:
            return api_key
        
        # Try loading from key file at root
        key_file_paths = [
            '/app/gemini_key.txt',
            '/app/.gemini_key',
            './gemini_key.txt',
            './.gemini_key'
        ]
        
        for key_file in key_file_paths:
            try:
                if os.path.exists(key_file):
                    with open(key_file, 'r') as f:
                        key = f.read().strip()
                        if key:
                            logger.info(f"Loaded Gemini API key from {key_file}")
                            return key
            except Exception as e:
                logger.warning(f"Error reading key file {key_file}: {e}")
        
        logger.warning("No Gemini API key found. Set GEMINI_API_KEY environment variable or create a key file.")
        return None
    
    async def generate_response(self, prompt: str, task_id: str, 
                              model: str = None, temperature: float = 0.7,
                              max_tokens: int = 4000) -> Optional[GeminiResponse]:
        """
        Generate response from Gemini API
        
        Args:
            prompt: The input prompt
            task_id: Task ID for token tracking
            model: Model to use (defaults to default_model)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            
        Returns:
            GeminiResponse object or None if failed
        """
        if not self.api_key:
            logger.error("No Gemini API key available")
            return None
        
        model = model or self.default_model
        
        # Check token limits before making request
        if not self.token_meter.can_make_request(task_id, len(prompt.split())):
            logger.warning(f"Token limit exceeded for task {task_id}")
            return None
        
        for attempt in range(self.max_retries):
            try:
                response = await self._make_api_request(
                    prompt=prompt,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
                
                if response:
                    # Track token usage
                    self.token_meter.track_usage(
                        task_id=task_id,
                        input_tokens=response.input_tokens,
                        output_tokens=response.output_tokens,
                        model=response.model
                    )
                    
                    return response
                
            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed for Gemini API: {e}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
        
        logger.error(f"All {self.max_retries} attempts failed for Gemini API")
        return None
    
    async def _make_api_request(self, prompt: str, model: str, 
                               temperature: float, max_tokens: int) -> Optional[GeminiResponse]:
        # Makes actual API request to Gemini using official client library
        """Make the actual API request to Gemini"""
        try:
            # This is a placeholder implementation
            # In a real implementation, you would use the official Gemini API client
            # For now, we'll simulate the API call
            
            import google.generativeai as genai
            
            genai.configure(api_key=self.api_key)
            
            # Configure the model
            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            }
            
            model_instance = genai.GenerativeModel(
                model_name=model,
                generation_config=generation_config
            )
            
            # Generate response
            response = await model_instance.generate_content_async(prompt)
            
            if response and response.text:
                # Estimate token counts (in a real implementation, these would come from the API)
                input_tokens = len(prompt.split()) * 1.3  # Rough estimation
                output_tokens = len(response.text.split()) * 1.3
                
                return GeminiResponse(
                    content=response.text,
                    model=model,
                    input_tokens=int(input_tokens),
                    output_tokens=int(output_tokens),
                    finish_reason=response.candidates[0].finish_reason.name if response.candidates else "STOP",
                    metadata={
                        "safety_ratings": [rating.category.name for rating in response.candidates[0].safety_ratings] if response.candidates else []
                    }
                )
            
            return None
            
        except ImportError:
            logger.error("Google Generative AI library not installed. Install with: pip install google-generativeai")
            # Fallback to mock response for development
            return self._create_mock_response(prompt, model)
        except Exception as e:
            logger.error(f"Error making Gemini API request: {e}")
            return None
    
    def _create_mock_response(self, prompt: str, model: str) -> GeminiResponse:
        # Creates mock response for development/testing when API is unavailable
        """Create a mock response for development/testing"""
        mock_content = f"""
Based on your request, I understand you want me to act as a {model} and process the following prompt:

{prompt[:200]}...

This is a mock response for development purposes. In a production environment, this would be replaced with actual Gemini API responses.

Key points I would address:
1. Analyze the requirements thoroughly
2. Provide structured recommendations
3. Consider best practices and constraints
4. Deliver actionable insights

Please configure a valid Gemini API key to get real responses.
"""
        
        return GeminiResponse(
            content=mock_content,
            model=model,
            input_tokens=len(prompt.split()),
            output_tokens=len(mock_content.split()),
            finish_reason="STOP",
            metadata={"mock": True}
        )
    
    def update_api_key(self, new_api_key: str):
        # Updates API key dynamically and reconfigures client
        """Update the API key dynamically"""
        try:
            self.api_key = new_api_key
            # Reinitialize the client with new API key
            if self.api_key:
                import google.generativeai as genai
                genai.configure(api_key=self.api_key)
                logger.info("Updated Gemini API key successfully")
            else:
                logger.warning("API key is empty")
        except Exception as e:
            logger.error(f"Error updating API key: {e}")
            raise
    
    def switch_model(self, model_name: str) -> bool:
        # Changes default model to specified Gemini model if available
        """Switch to a different Gemini model"""
        if model_name in self.available_models:
            self.default_model = model_name
            logger.info(f"Switched to model: {model_name}")
            return True
        else:
            logger.error(f"Model {model_name} not available. Available models: {self.available_models}")
            return False
    
    def get_model_info(self) -> Dict[str, Any]:
        # Returns information about available models and current configuration
        """Get information about available models"""
        return {
            "available_models": self.available_models,
            "current_model": self.default_model,
            "api_key_configured": bool(self.api_key)
        }
    
    async def test_connection(self) -> bool:
        # Tests API connection by sending simple test message
        """Test connection to Gemini API"""
        try:
            response = await self.generate_response(
                prompt="Hello, this is a test message.",
                task_id="test",
                max_tokens=50
            )
            return response is not None
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False

