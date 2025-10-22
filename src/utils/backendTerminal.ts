// Backend Terminal utility for WebSocket-based terminal communication
// This replaces HTTP calls with WebSocket connection to node-pty backend

export interface BackendTerminalResponse {
  success: boolean
  stdout: string
  stderr: string
  return_code?: number
  error?: string
}

export interface TerminalCommand {
  command: string
  language?: string
  file_path?: string
  code?: string
  args?: string[]
  cwd?: string
  session_id?: string
  command_line?: string
}

/**
 * Maps file extensions to language identifiers
 */
export function getLanguageFromExtension(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop()
  
  switch (extension) {
    case 'py':
      return 'python'
    case 'js':
      return 'javascript'
    case 'ts':
      return 'typescript'
    case 'c':
      return 'c'
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'cpp'
    case 'java':
      return 'java'
    case 'rs':
      return 'rust'
    case 'go':
      return 'go'
    case 'php':
      return 'php'
    case 'rb':
      return 'ruby'
    case 'swift':
      return 'swift'
    case 'kt':
      return 'kotlin'
    case 'scala':
      return 'scala'
    case 'cs':
      return 'csharp'
    case 'fs':
      return 'fsharp'
    case 'hs':
      return 'haskell'
    case 'ml':
      return 'ocaml'
    case 'clj':
      return 'clojure'
    case 'lisp':
      return 'commonlisp'
    case 'r':
      return 'r'
    case 'm':
      return 'octave'
    case 'pl':
      return 'perl'
    case 'sh':
    case 'bash':
      return 'bash'
    case 'ps1':
      return 'powershell'
    case 'sql':
      return 'sql'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'json':
      return 'json'
    case 'xml':
      return 'xml'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'md':
      return 'markdown'
    case 'txt':
      return 'plaintext'
    default:
      return 'plaintext'
  }
}

// Note: All terminal operations are now handled via WebSocket in the Terminal component
// These functions are kept for backward compatibility but are deprecated

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function executeTerminalCommand(commandData: TerminalCommand): Promise<BackendTerminalResponse> {
  console.warn('executeTerminalCommand is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runCode(language: string, code: string): Promise<BackendTerminalResponse> {
  console.warn('runCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runFile(filePath: string): Promise<BackendTerminalResponse> {
  console.warn('runFile is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runSystemCommand(args: string[]): Promise<BackendTerminalResponse> {
  console.warn('runSystemCommand is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runShellCommand(sessionId: string, commandLine: string, cwd?: string): Promise<BackendTerminalResponse & { cwd?: string }> {
  console.warn('runShellCommand is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  } as any;
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function listFiles(cwd: string = ''): Promise<BackendTerminalResponse> {
  console.warn('listFiles is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function getFileContent(filePath: string): Promise<BackendTerminalResponse> {
  console.warn('getFileContent is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runPythonCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runPythonCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runJavaScriptCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runJavaScriptCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runCCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runCCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runCppCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runCppCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runJavaCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runJavaCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runRustCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runRustCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}

/**
 * @deprecated Use WebSocket connection in Terminal component instead
 */
export async function runGoCode(code: string): Promise<BackendTerminalResponse> {
  console.warn('runGoCode is deprecated. Use WebSocket connection in Terminal component instead.');
  return {
    success: false,
    stdout: '',
    stderr: 'This function is deprecated. Use WebSocket connection instead.',
    error: 'Deprecated function'
  };
}
