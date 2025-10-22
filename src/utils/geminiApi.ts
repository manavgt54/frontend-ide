import { getBackendUrl } from '../config/env';

const BACKEND_URL = getBackendUrl();

export interface GeminiResponse {
  success: boolean
  response?: string
  error?: string
  agent?: string
}

export async function callGeminiAPI(message: string, context: string = ""): Promise<GeminiResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        agent_role: 'developer',
        context
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error calling Gemini API:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function executePythonWithGemini(code: string, context: string = ""): Promise<GeminiResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Execute this Python code and return the result: ${code}`,
        agent_role: 'developer',
        context
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error calling Gemini API for Python execution:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
