"""
Official Gemini CLI Client Module for Adaptive System

This module implements direct integration with the official Gemini CLI tool
to provide CLI-like interaction with Gemini models, including direct file system access
and detailed logging that mirrors the interactive CLI experience.
"""

import os
import json
import time
import subprocess
import logging
from typing import Dict, List, Optional, Any, Callable, Tuple
from datetime import datetime
from src.utils.logger import get_logger
from src.config.timeout_config import get_agent_timeout_config, get_retry_delay
import asyncio
import selectors
from subprocess import Popen, PIPE

logger = get_logger(__name__)

class GeminiCLIError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message

class GeminiCLIClient:
    """
    Official Gemini CLI Client that provides direct integration with the Gemini CLI tool
    with file system access and detailed logging that mirrors CLI interactive mode.
    """
    
    def __init__(self, api_key: str = None, model_name: str = "gemini-2.5-flash"):
        """
        Initialize the official Gemini CLI client
        
        Args:
            api_key: Gemini API key
            model_name: Model to use (default: gemini-2.5-flash)
        """
        self.api_key = api_key or os.getenv('GEMINI_API_KEY')
        self.model_name = model_name
        self.log_callback = None
        self.conversation_history = []
        self.mcp_args: List[str] = []  # CLI tokens to register MCP servers
        
        # Configure API key FIRST before verification
        if self.api_key:
            self._configure_api_key()
        else:
            logger.warning("No Gemini API key provided. Client will not be functional.")
        
        # Verify Gemini CLI is installed (after API key is configured)
        self._verify_gemini_cli()
    
    def _get_gemini_command(self, args: List[str]) -> List[str]:
        """Get the appropriate command to run Gemini CLI based on platform"""
        if os.name == 'nt':  # Windows
            # Call the actual JavaScript file directly with Node.js to avoid cmd wrapper issues
            return ['C:\\nvm4w\\nodejs\\node.exe', 'C:\\nvm4w\\nodejs\\node_modules\\@google\\gemini-cli\\dist\\index.js'] + args
        else:
            # Unix-like systems
            return ['gemini'] + args
    
    def _verify_gemini_cli(self):
        # Verifies that Gemini CLI tool is installed and accessible
        """Verify that Gemini CLI is installed and accessible"""
        try:
            # Use the platform-appropriate command
            cmd = self._get_gemini_command(['--version'])
            # Pass environment variables including the API key
            env = dict(os.environ)
            if self.api_key:
                env['GEMINI_API_KEY'] = self.api_key
            
            # Try with a shorter timeout and non-interactive mode
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5, env=env, input="", stdin=subprocess.PIPE, encoding='utf-8', errors='replace')
            if result.returncode == 0:
                self._log_cli_output("INFO", f"[SUCCESS] Gemini CLI found: {result.stdout.strip()}")
            else:
                # If version check fails, try to continue anyway - CLI might work for actual usage
                self._log_cli_output("WARNING", f"[WARNING] Gemini CLI version check failed: {result.stderr}")
                self._log_cli_output("INFO", "[INFO] Continuing anyway - CLI might work for actual usage")
        except subprocess.TimeoutExpired:
            # If timeout, assume CLI is installed but might be slow
            self._log_cli_output("WARNING", "[WARNING] Gemini CLI version check timed out")
            self._log_cli_output("INFO", "[INFO] Continuing anyway - CLI might work for actual usage")
        except Exception as e:
            self._log_cli_output("WARNING", f"[WARNING] Gemini CLI verification failed: {str(e)}")
            self._log_cli_output("INFO", "[INFO] Continuing anyway - CLI might work for actual usage")
    
    def _configure_api_key(self):
        # Sets API key as environment variable for Gemini CLI authentication
        """Configure the API key for Gemini CLI"""
        try:
            # Set the API key as environment variable
            os.environ['GEMINI_API_KEY'] = self.api_key
            self._log_cli_output("INFO", "[INFO] API key configured for Gemini CLI")
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to configure API key: {str(e)}")
    
    def set_log_callback(self, callback: Callable[[str, str], None]):
        """
        Set a callback function for logging CLI-like output
        
        Args:
            callback: Function that takes (log_level, message) parameters
        """
        self.log_callback = callback
    
    def _log_cli_output(self, level: str, message: str):
        # Logs CLI-like output with timestamp and calls custom callback if set
        """Log CLI-like output"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_message = f"[{timestamp}] {message}"
        
        # Log to standard logger
        if level == "INFO":
            logger.info(formatted_message)
        elif level == "ERROR":
            logger.error(formatted_message)
        elif level == "WARNING":
            logger.warning(formatted_message)
        elif level == "DEBUG":
            logger.debug(formatted_message)
        
        # Call custom callback if set
        if self.log_callback:
            self.log_callback(level, formatted_message)
    
    def start_chat_session(self, system_prompt: str = None):
        # Initializes new chat session and clears conversation history
        """
        Start a new chat session with Gemini CLI
        
        Args:
            system_prompt: Optional system prompt to initialize the session
        """
        try:
            self._log_cli_output("INFO", "[INFO] Starting Gemini CLI chat session")
            
            # Clear conversation history
            self.conversation_history = []
            
            if system_prompt:
                self._log_cli_output("INFO", f"[INFO] System prompt: {system_prompt[:100]}...")
            
            self._log_cli_output("INFO", "[SUCCESS] Chat session started successfully")
            
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to start chat session: {str(e)}")
            raise
    
    async def send_message(self, message: str, context: Dict[str, Any] = None, agent_name: str = None, temperature: Optional[float] = None) -> str:
        """
        Send a message to Gemini CLI and get response
        
        Args:
            message: The message to send
            context: Optional context information
            agent_name: Name of the agent for timeout configuration (optional)
            temperature: Optional sampling temperature (advisory only; CLI has no flag)
            
        Returns:
            The model's response
        """
        try:
            # Log the input
            self._log_cli_output("INFO", f"[SEND] Sending message to {self.model_name}")
            self._log_cli_output("DEBUG", f"[MSG] Message length: {len(message)} characters")
            
            if context:
                self._log_cli_output("DEBUG", f"[CTX] Context provided: {list(context.keys())}")
            
            if agent_name:
                self._log_cli_output("DEBUG", f"[AGENT] Agent: {agent_name}")
            if temperature is not None:
                self._log_cli_output("DEBUG", f"[TEMP] Temperature (advisory): {temperature}")
            
            # Prepare the full message with context
            full_message = message
            if context:
                context_str = "\n\n=== CONTEXT ===\n"
                for key, value in context.items():
                    context_str += f"{key}: {value}\n"
                full_message = context_str + "\n\n=== MESSAGE ===\n" + message
            
            # Determine overall timeout for async guard
            if agent_name:
                timeout_config = get_agent_timeout_config(agent_name)
                overall_cap = timeout_config.get('overall', 900)
            else:
                overall_cap = 900

            # Send message to Gemini CLI
            start_time = time.time()
            self._log_cli_output("INFO", "[WAIT] Waiting for model response...")
            
            # Execute Gemini CLI command with agent-specific timeout in a background thread
            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self._execute_gemini_cli_command,
                        full_message,
                        None,
                        2,
                        agent_name,
                        None  # do not pass CLI flag for temperature
                    ),
                    timeout=overall_cap + 5  # small cushion above internal cap
                )
            except asyncio.TimeoutError:
                self._log_cli_output("ERROR", f"[ERROR] Async overall timeout exceeded ({overall_cap}s) for agent {agent_name or 'unknown'}")
                raise GeminiCLIError("timeout", f"Overall timeout exceeded after {overall_cap}s")
            
            end_time = time.time()
            response_time = end_time - start_time
            
            # Log the response
            self._log_cli_output("INFO", f"[SUCCESS] Response received in {response_time:.2f} seconds")
            if isinstance(response, str):
                self._log_cli_output("DEBUG", f"[INFO] Response length: {len(response)} characters")
            else:
                self._log_cli_output("WARNING", "[INFO] Response was not a string; coercing to 'OK'")
                response = "OK"
            
            # Add to conversation history
            self.conversation_history.append({"role": "user", "content": message})
            self.conversation_history.append({"role": "assistant", "content": response})
            
            return response or "OK"
            
        except GeminiCLIError as ge:
            self._log_cli_output("ERROR", f"[ERROR] Gemini CLI error [{ge.code}]: {ge.message}")
            raise
        except Exception as e:
            error_msg = str(e)
            self._log_cli_output("ERROR", f"[ERROR] Error sending message: {error_msg}")
            raise
    
    def generate_single_response(self, prompt: str, context: Dict[str, Any] = None, working_dir: str = None, agent_name: str = None, temperature: Optional[float] = None) -> str:
        """
        Generate a single response without maintaining chat history
        
        Args:
            prompt: The prompt to send
            context: Optional context information
            working_dir: Working directory for the command (optional)
            agent_name: Name of the agent for timeout configuration (optional)
            temperature: Optional sampling temperature (advisory only; CLI has no flag)
            
        Returns:
            The model's response
        """
        try:
            # Log the input
            self._log_cli_output("INFO", f"[SEND] Generating single response with {self.model_name}")
            self._log_cli_output("DEBUG", f"[MSG] Prompt length: {len(prompt)} characters")
            
            if context:
                self._log_cli_output("DEBUG", f"[CTX] Context provided: {list(context.keys())}")
            
            if working_dir:
                self._log_cli_output("DEBUG", f"📁 Working directory: {working_dir}")
            
            if agent_name:
                self._log_cli_output("DEBUG", f"[AGENT] Agent: {agent_name}")
            if temperature is not None:
                self._log_cli_output("DEBUG", f"[TEMP] Temperature (advisory): {temperature}")
            
            # Prepare the full prompt with context
            full_prompt = prompt
            if context:
                context_str = "\n\n=== CONTEXT ===\n"
                for key, value in context.items():
                    context_str += f"{key}: {value}\n"
                full_prompt = context_str + "\n\n=== PROMPT ===\n" + prompt
            
            # Generate response and track timing
            start_time = time.time()
            self._log_cli_output("INFO", "[WAIT] Generating response...")
            
            # Execute Gemini CLI command with agent-specific timeout
            response = self._execute_gemini_cli_command(full_prompt, working_dir, agent_name=agent_name, temperature=None)
            
            end_time = time.time()
            response_time = end_time - start_time
            
            # Log the response
            self._log_cli_output("INFO", f"[SUCCESS] Response generated in {response_time:.2f} seconds")
            self._log_cli_output("DEBUG", f"[INFO] Response length: {len(response)} characters")
            
            return response
            
        except GeminiCLIError as ge:
            self._log_cli_output("ERROR", f"[ERROR] Error generating response [{ge.code}]: {ge.message}")
            raise
        except Exception as e:
            error_msg = str(e)
            self._log_cli_output("ERROR", f"[ERROR] Error generating response: {error_msg}")
            raise
    
    def _execute_gemini_cli_command(self, prompt: str, working_dir: str = None, max_retries: int = 2, agent_name: str = None, temperature: Optional[float] = None) -> str:
        """
        Execute a command using the official Gemini CLI with retry logic
        
        Args:
            prompt: The prompt to send to Gemini CLI
            working_dir: Working directory for the command (optional)
            max_retries: Maximum number of retry attempts (default: 2)
            agent_name: Name of the agent for timeout configuration (optional)
            temperature: Deprecated/no-op for CLI (kept for API compatibility)
            
        Returns:
            The response from Gemini CLI
        """
        last_exception = None
        
        def _build_include_dirs_args() -> List[str]:
            include_args: List[str] = []
            dirs: List[str] = []
            if working_dir:
                dirs.append(working_dir)
                # Also include common subdirectories that might be created in the project
                try:
                    # Check if backend/ and frontend/ directories exist in the working directory
                    backend_dir = os.path.join(working_dir, 'backend')
                    frontend_dir = os.path.join(working_dir, 'frontend')
                    sureai_dir = os.path.join(working_dir, '.sureai')
                    
                    if os.path.exists(backend_dir):
                        dirs.append(backend_dir)
                    if os.path.exists(frontend_dir):
                        dirs.append(frontend_dir)
                    if os.path.exists(sureai_dir):
                        dirs.append(sureai_dir)
                        
                    # Also include any other subdirectories that might exist
                    for item in os.listdir(working_dir):
                        item_path = os.path.join(working_dir, item)
                        if os.path.isdir(item_path) and item not in ['.git', '__pycache__', '.pytest_cache']:
                            dirs.append(item_path)
                except Exception as e:
                    # Log but don't fail if we can't scan directories
                    pass
            # Common project roots inside container
            import tempfile
            for d in ['/app', os.path.join(tempfile.gettempdir(), 'adaptive_system_output')]:
                try:
                    if os.path.exists(d):
                        dirs.append(d)
                except Exception:
                    pass
            # De-duplicate
            seen = set()
            for d in dirs:
                if d and d not in seen:
                    include_args.extend(['--include-directories', d])
                    seen.add(d)
            
            # Log the directories being included for debugging
            if dirs:
                self._log_cli_output("DEBUG", f"📁 Including directories: {', '.join(dirs)}")
            
            return include_args

        # Get timeout configuration based on agent name
        if agent_name:
            timeout_config = get_agent_timeout_config(agent_name)
            max_retries = timeout_config.get('max_retries', max_retries)
            base_timeout = timeout_config.get('timeout', 300)
            retry_timeout = timeout_config.get('retry_timeout', base_timeout)
            overall_cap = timeout_config.get('overall', base_timeout + retry_timeout)
        else:
            base_timeout = 300
            retry_timeout = 600
            overall_cap = 900
        
        def classify_error(stderr_text: str) -> Optional[GeminiCLIError]:
            if not stderr_text:
                return None
            s = stderr_text.lower()
            if any(k in s for k in ["quota", "exceeded your current quota", "rate limit", "too many requests", "status: 429", "resource_exhausted"]):
                return GeminiCLIError("quota_exceeded", stderr_text.strip())
            if any(k in s for k in ["unauthorized", "invalid api key", "status: 401", "forbidden", "status: 403"]):
                return GeminiCLIError("unauthorized", stderr_text.strip())
            if any(k in s for k in ["timeout", "timed out"]):
                return GeminiCLIError("timeout", stderr_text.strip())
            return None
        
        overall_start = time.time()
        
        for attempt in range(max_retries + 1):
            try:
                # Abort if we've exceeded overall cap
                elapsed = time.time() - overall_start
                if elapsed >= overall_cap:
                    raise Exception(f"Overall timeout exceeded ({int(elapsed)}s >= {overall_cap}s)")
                
                # Per-attempt timeout budget
                timeout_duration = base_timeout if attempt == 0 else retry_timeout
                remaining_overall = overall_cap - elapsed
                timeout_duration = max(5, min(timeout_duration, int(remaining_overall)))
                # Idle timeout budget from config (if available)
                try:
                    idle_timeout = get_agent_timeout_config(agent_name or "").get('idle', 120)
                except Exception:
                    idle_timeout = 120
 
                # 1) Prefer STDIN mode to minimize sandbox warnings
                stdin_cmd = self._get_gemini_command(['--yolo', '--model', self.model_name] + _build_include_dirs_args() + (self.mcp_args or []))
                self._log_cli_output("DEBUG", f"[EXEC] Executing (stdin mode): {' '.join(stdin_cmd)} (Attempt {attempt + 1}/{max_retries + 1})")
                stdout_text, stderr_text, return_code = self._run_cli_with_streaming(
                    cmd=stdin_cmd,
                    input_text=prompt,
                    timeout_seconds=timeout_duration,
                    idle_timeout_seconds=idle_timeout,
                    cwd=working_dir
                )
                self._log_cli_output("DEBUG", f"[OUTPUT] CLI stdout length: {len(stdout_text)} | stderr length: {len(stderr_text)}")

                if return_code == 0:
                    self._log_cli_output("INFO", f"[SUCCESS] Gemini CLI (stdin mode) completed successfully (Attempt {attempt + 1})")
                    if stdout_text:
                        return stdout_text
                    if stderr_text:
                        # Even with return_code 0, sometimes CLI prints warnings to stderr
                        err = classify_error(stderr_text)
                        if err:
                            raise err
                        return stderr_text
                    return "OK"
                else:
                    # Non-zero return code: parse error before fallback
                    err = classify_error(stderr_text)
                    if err:
                        raise err
                    self._log_cli_output("WARNING", f"Gemini CLI (stdin mode) failed: {stderr_text or 'unknown error'}; trying arg mode")

                # 2) Fall back to ARG-MODE
                base_arg = self._get_gemini_command(['--yolo', '--model', self.model_name])
                arg_cmd = base_arg + _build_include_dirs_args() + (self.mcp_args or []) + ['-p', prompt]
                self._log_cli_output("DEBUG", f"[EXEC] Executing (arg mode): {' '.join(base_arg)} -p <prompt> (Attempt {attempt + 1}/{max_retries + 1})")
                try:
                    arg_result = subprocess.run(
                        arg_cmd,
                        capture_output=True,
                        text=True,
                        timeout=timeout_duration,
                        cwd=working_dir,
                        env=dict(os.environ, GEMINI_API_KEY=self.api_key, CI="1") if self.api_key else dict(os.environ, CI="1"),
                        encoding='utf-8',
                        errors='replace'
                    )
                    arg_stdout = (arg_result.stdout or "").strip()
                    arg_stderr = (arg_result.stderr or "").strip()
                    self._log_cli_output("DEBUG", f"[OUTPUT] Arg-mode stdout length: {len(arg_stdout)} | stderr length: {len(arg_stderr)}")
                    if arg_result.returncode == 0:
                        self._log_cli_output("INFO", f"[SUCCESS] Gemini CLI (arg mode) completed successfully (Attempt {attempt + 1})")
                        if arg_stdout:
                            return arg_stdout
                        if arg_stderr:
                            err = classify_error(arg_stderr)
                            if err:
                                raise err
                            return arg_stderr
                        return "OK"
                    else:
                        err = classify_error(arg_stderr)
                        if err:
                            raise err
                        self._log_cli_output("ERROR", f"[ERROR] Gemini CLI (arg mode) failed: {arg_stderr or 'unknown error'}")
                        raise Exception(f"Gemini CLI failed: {arg_stderr or 'unknown error'}")
                except GeminiCLIError as ge:
                    raise
                except Exception as arg_exc:
                    self._log_cli_output("ERROR", f"[ERROR] Gemini CLI (arg mode) error: {arg_exc}")
                 
            except subprocess.TimeoutExpired as e:
                last_exception = e
                self._log_cli_output("WARNING", f"[TIMEOUT] Gemini CLI command timed out (Attempt {attempt + 1}/{max_retries + 1})")
                if attempt < max_retries:
                    retry_delay = get_retry_delay('timeout')
                    self._log_cli_output("INFO", f"[RETRY] Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    self._log_cli_output("ERROR", "[ERROR] All retry attempts failed - Gemini CLI command timed out")
                    raise GeminiCLIError("timeout", "Gemini CLI command timed out after all retry attempts")
            except GeminiCLIError as ge:
                last_exception = ge
                self._log_cli_output("ERROR", f"[ERROR] Classified Gemini error [{ge.code}] on attempt {attempt + 1}: {ge.message}")
                # Do not retry unauthorized/quota errors
                if ge.code in ["unauthorized", "quota_exceeded"] or attempt >= max_retries:
                    raise
                retry_delay = get_retry_delay('error')
                self._log_cli_output("INFO", f"[RETRY] Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            except Exception as e:
                last_exception = e
                self._log_cli_output("ERROR", f"[ERROR] Failed to execute Gemini CLI command (Attempt {attempt + 1}): {str(e)}")
                if attempt < max_retries:
                    retry_delay = get_retry_delay('error')
                    self._log_cli_output("INFO", f"[RETRY] Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    raise
        
        # If we get here, all retries failed
        raise last_exception if last_exception else GeminiCLIError("unknown", "Unknown error occurred")

    def _run_cli_with_streaming(self, cmd: List[str], input_text: str, timeout_seconds: int, idle_timeout_seconds: int, cwd: Optional[str]) -> Tuple[str, str, int]:
        """
        Run the CLI command with streaming IO to enforce idle timeouts and avoid hangs.
        Returns (stdout, stderr, return_code).
        """
        start_time = time.time()
        last_output_time = start_time
        env = dict(os.environ, GEMINI_API_KEY=self.api_key, CI="1") if self.api_key else dict(os.environ, CI="1")

        process: Popen = Popen(
            cmd,
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
            text=True,
            bufsize=1,
            cwd=cwd,
            env=env,
            encoding='utf-8',
            errors='replace'
        )

        selector = selectors.DefaultSelector()
        if process.stdout:
            selector.register(process.stdout, selectors.EVENT_READ)
        if process.stderr:
            selector.register(process.stderr, selectors.EVENT_READ)

        try:
            # Send input immediately
            if process.stdin:
                process.stdin.write(input_text)
                process.stdin.flush()
                process.stdin.close()

            stdout_chunks: List[str] = []
            stderr_chunks: List[str] = []

            while True:
                # Check overall timeout
                now = time.time()
                if now - start_time > timeout_seconds:
                    process.kill()
                    raise subprocess.TimeoutExpired(cmd=cmd, timeout=timeout_seconds)

                # Check idle timeout
                if now - last_output_time > idle_timeout_seconds:
                    process.kill()
                    raise subprocess.TimeoutExpired(cmd=cmd, timeout=idle_timeout_seconds)

                if process.poll() is not None and not selector.get_map():
                    break

                events = selector.select(timeout=0.5)
                if not events:
                    continue

                for key, _ in events:
                    stream = key.fileobj
                    try:
                        data = stream.readline()
                    except Exception:
                        data = ''
                    if not data:
                        # Stream closed; unregister
                        try:
                            selector.unregister(stream)
                        except Exception:
                            pass
                        continue
                    last_output_time = time.time()
                    if stream is process.stdout:
                        stdout_chunks.append(data)
                    else:
                        stderr_chunks.append(data)

            # Ensure process is reaped
            return_code = process.wait(timeout=1)
            return ("".join(stdout_chunks).strip(), "".join(stderr_chunks).strip(), return_code)
        finally:
            try:
                if process.poll() is None:
                    process.kill()
            except Exception:
                pass
            try:
                selector.close()
            except Exception:
                pass
    
    def switch_model(self, model_name: str):
        """
        Switch to a different Gemini model
        
        Args:
            model_name: Name of the model to switch to
        """
        try:
            self._log_cli_output("INFO", f"[RETRY] Switching from {self.model_name} to {model_name}")
            
            old_model = self.model_name
            self.model_name = model_name
            
            self._log_cli_output("INFO", f"[SUCCESS] Successfully switched to {model_name}")
            
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to switch model: {str(e)}")
            raise
    
    def update_api_key(self, api_key: str):
        """
        Update the API key
        
        Args:
            api_key: New API key
        """
        try:
            self._log_cli_output("INFO", "[KEY] Updating API key")
            self.api_key = api_key
            self._configure_api_key()
            self._log_cli_output("INFO", "[SUCCESS] API key updated successfully")
            
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to update API key: {str(e)}")
            raise
    
    def get_conversation_history(self) -> List[Dict[str, Any]]:
        """Get the conversation history"""
        return self.conversation_history.copy()
    
    def clear_conversation_history(self):
        """Clear the conversation history"""
        self.conversation_history = []
        self._log_cli_output("INFO", "[CLEAR] Conversation history cleared")
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model"""
        return {
            "model_name": self.model_name,
            "api_key_configured": bool(self.api_key),
            "conversation_history_length": len(self.conversation_history)
        }
    
    def save_conversation(self, file_path: str):
        """
        Save the conversation history to a file
        
        Args:
            file_path: Path to save the conversation
        """
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(self.conversation_history, f, indent=2, ensure_ascii=False)
            
            self._log_cli_output("INFO", f"[SAVE] Conversation saved to {file_path}")
            
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to save conversation: {str(e)}")
            raise
    
    def load_conversation(self, file_path: str):
        """
        Load conversation history from a file
        
        Args:
            file_path: Path to load the conversation from
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                self.conversation_history = json.load(f)
            
            self._log_cli_output("INFO", f"[LOAD] Conversation loaded from {file_path}")
            
        except Exception as e:
            self._log_cli_output("ERROR", f"[ERROR] Failed to load conversation: {str(e)}")
            raise

    def set_mcp_servers(self, servers: List[Dict[str, Any]]):
        """Configure MCP servers to be passed to Gemini CLI as flags on every call.
        Expected server dicts contain: name, command, enabled (bool)."""
        try:
            args: List[str] = []
            for s in servers or []:
                try:
                    if not s.get('enabled', True):
                        continue
                    name = s.get('name')
                    cmd = s.get('command')
                    if name and cmd:
                        args.append(f"--mcp={name}={cmd}")
                except Exception:
                    continue
            self.mcp_args = args
            self._log_cli_output("INFO", f"[EXEC] Configured {len(self.mcp_args)} MCP server flags for Gemini CLI")
        except Exception as e:
            self._log_cli_output("ERROR", f"Failed to configure MCP servers: {e}")

