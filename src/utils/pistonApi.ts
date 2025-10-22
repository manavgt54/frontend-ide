// Piston API utility for code execution
// Free public API at https://emkc.org/api/v2/piston/execute

export interface PistonResponse {
  language: string
  version: string
  run: {
    stdout: string
    stderr: string
    code: number
    signal: string | null
    output: string
  }
  compile?: {
    stdout: string
    stderr: string
    code: number
    signal: string | null
    output: string
  }
}

export interface ExecutionResult {
  stdout: string
  stderr: string
  success: boolean
  error?: string
}

/**
 * Maps file extensions to Piston API language identifiers
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

/**
 * Extracts input prompts from Python code
 */
export function extractInputPrompts(code: string, language: string): string[] {
  const prompts: string[] = []
  
  console.log('🔍 extractInputPrompts called with:', { code: code.substring(0, 100), language })
  
  if (language === 'python') {
    // Match all input() calls (both with and without prompts)
    const allInputMatches = code.match(/input\s*\([^)]*\)/g) || []
    console.log('🔍 Found input matches:', allInputMatches)
    
    allInputMatches.forEach(match => {
      // Try to extract the prompt string
      const promptMatch = match.match(/input\s*\(\s*["']([^"']*)["']\s*\)/)
      if (promptMatch && promptMatch[1]) {
        prompts.push(promptMatch[1])
        console.log('🔍 Extracted prompt:', promptMatch[1])
      } else {
        // Handle raw input() or input with complex expressions
        prompts.push('Enter value:')
        console.log('🔍 Added default prompt for:', match)
      }
    })
  }
  
  console.log('🔍 Final prompts:', prompts)
  return prompts
}

/**
 * Replaces input() functions with user-provided values
 */
export function replaceInputsWithValues(code: string, language: string, values: string[]): string {
  let processedCode = code
  let valueIndex = 0
  
  if (language === 'python') {
    // Replace input() calls with actual values
    processedCode = processedCode.replace(
      /input\s*\(\s*["']([^"']*)["']\s*\)/g,
      () => {
        const value = values[valueIndex] || 'test_value'
        valueIndex++
        return `"${value}"`
      }
    )
    
    // Also handle raw input() calls
    processedCode = processedCode.replace(
      /input\s*\(\s*\)/g,
      () => {
        const value = values[valueIndex] || 'test_value'
        valueIndex++
        return `"${value}"`
      }
    )
  }
  
  return processedCode
}

/**
 * Automatically handles input() functions by replacing them with test values
 */
export function preprocessCodeForInput(code: string, language: string): string {
  let processedCode = code
  
  if (language === 'python') {
    // Replace input() with test values
    processedCode = processedCode.replace(
      /input\s*\(\s*["']([^"']*)["']\s*\)/g,
      (match, prompt) => {
        // Generate appropriate test value based on context
        if (prompt.toLowerCase().includes('number') || prompt.toLowerCase().includes('num')) {
          return '"42"'  // Test number
        } else if (prompt.toLowerCase().includes('name')) {
          return '"TestUser"'  // Test name
        } else if (prompt.toLowerCase().includes('string') || prompt.toLowerCase().includes('text')) {
          return '"test_string"'  // Test string
        } else if (prompt.toLowerCase().includes('first') && prompt.toLowerCase().includes('second')) {
          return '"10"'  // First number for comparisons
        } else if (prompt.toLowerCase().includes('second')) {
          return '"5"'   // Second number for comparisons
        } else if (prompt.toLowerCase().includes('first')) {
          return '"15"'  // First number
        } else {
          return '"test_input"'  // Generic test value
        }
      }
    )
    
    // Also handle raw input() calls
    processedCode = processedCode.replace(
      /input\s*\(\s*\)/g,
      '"test_input"'
    )
    
    // Handle multiple input() calls with different values
    let inputCount = 0
    processedCode = processedCode.replace(
      /input\s*\(\s*["']([^"']*)["']\s*\)/g,
      (match, prompt) => {
        inputCount++
        if (inputCount === 1) {
          if (prompt.toLowerCase().includes('first')) return '"10"'
          if (prompt.toLowerCase().includes('second')) return '"5"'
          return '"42"'
        } else if (inputCount === 2) {
          if (prompt.toLowerCase().includes('second')) return '"5"'
          return '"15"'
        } else {
          return '"test_value"'
        }
      }
    )
  }
  
  return processedCode
}

/**
 * Executes code using the free Piston API
 */
export async function runCode(language: string, code: string): Promise<ExecutionResult> {
  try {
    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: language,
        version: '*', // Use latest version
        files: [
          {
            name: `main.${getFileExtension(language)}`,
            content: code
          }
        ],
        stdin: '',
        args: [],
        compile_timeout: 10000,
        run_timeout: 10000,
        memory_limit: 512000
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data: PistonResponse = await response.json()
    
    // Add debugging console.log to see full response
    console.log('Piston API Response:', data)
    
    // Check if compilation failed
    if (data.compile && data.compile.code !== 0) {
      return {
        stdout: '',
        stderr: data.compile.stderr || data.compile.output || 'Compilation failed',
        success: false,
        error: 'Compilation failed'
      }
    }

    // Check if execution failed
    if (data.run.code !== 0) {
      return {
        stdout: data.run.stdout || '',
        stderr: data.run.stderr || data.run.output || 'Execution failed',
        success: false,
        error: 'Execution failed'
      }
    }

    // Return the actual output from Piston
    return {
      stdout: data.run.output || data.run.stdout || '',
      stderr: data.run.stderr || '',
      success: true
    }
  } catch (error) {
    return {
      stdout: '',
      stderr: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Gets the appropriate file extension for a language
 */
function getFileExtension(language: string): string {
  switch (language) {
    case 'python':
      return 'py'
    case 'javascript':
      return 'js'
    case 'typescript':
      return 'ts'
    case 'c':
      return 'c'
    case 'cpp':
      return 'cpp'
    case 'java':
      return 'java'
    case 'rust':
      return 'rs'
    case 'go':
      return 'go'
    case 'php':
      return 'php'
    case 'ruby':
      return 'rb'
    case 'swift':
      return 'swift'
    case 'kotlin':
      return 'kt'
    case 'scala':
      return 'scala'
    case 'csharp':
      return 'cs'
    case 'fsharp':
      return 'fs'
    case 'haskell':
      return 'hs'
    case 'ocaml':
      return 'ml'
    case 'clojure':
      return 'clj'
    case 'commonlisp':
      return 'lisp'
    case 'r':
      return 'r'
    case 'octave':
      return 'm'
    case 'perl':
      return 'pl'
    case 'bash':
      return 'sh'
    case 'powershell':
      return 'ps1'
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
      return 'yaml'
    case 'markdown':
      return 'md'
    case 'plaintext':
      return 'txt'
    default:
      return 'txt'
  }
}
