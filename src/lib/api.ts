export type FileNode = {
  type: 'folder' | 'file'
  name: string
  path: string
  children?: FileNode[]
}

// Backend URL - update this to match your deployed backend
import { getBackendUrl } from '../config/env';

export const BACKEND_URL = getBackendUrl();
// Zip upload (single request)
export async function uploadZippedWorkspace(zipBytes: Uint8Array, projectPath: string, sessionId?: string): Promise<any> {
  const url = `${BACKEND_URL}/upload/zip?project=${encodeURIComponent(projectPath)}`
  const authUser = localStorage.getItem('auth_user')
  const token = authUser ? JSON.parse(authUser).terminalToken : undefined
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
      ...(token ? { 'x-terminal-token': token } : {}),
    },
    body: (() => {
      const copy = new Uint8Array(zipBytes.byteLength)
      copy.set(zipBytes)
      return new Blob([copy.buffer], { type: 'application/zip' })
    })()
  })
  if (!res.ok) throw new Error(`Zip upload failed: ${res.status}`)
  return res.json()
}

// Chunked upload (very large zips)
export async function uploadZipInChunks(zipBytes: Uint8Array, projectPath: string, sessionId?: string, chunkSize = 8 * 1024 * 1024): Promise<any> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const total = Math.ceil(zipBytes.byteLength / chunkSize)
  const authUser = localStorage.getItem('auth_user')
  const token = authUser ? JSON.parse(authUser).terminalToken : undefined
  for (let i = 0; i < total; i++) {
    const start = i * chunkSize
    const end = Math.min(zipBytes.byteLength, start + chunkSize)
    const chunk = zipBytes.slice(start, end)
    const res = await fetch(`${BACKEND_URL}/upload/zip-chunk?project=${encodeURIComponent(projectPath)}&id=${id}&index=${i}&total=${total}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(sessionId ? { 'x-session-id': sessionId } : {}),
        ...(token ? { 'x-terminal-token': token } : {}),
      },
      body: chunk
    })
    if (!res.ok) throw new Error(`Chunk ${i + 1}/${total} failed: ${res.status}`)
  }
  const finalize = await fetch(`${BACKEND_URL}/upload/zip-chunk/complete?project=${encodeURIComponent(projectPath)}&id=${id}`, {
    method: 'POST',
    headers: {
      ...(sessionId ? { 'x-session-id': sessionId } : {}),
      ...(token ? { 'x-terminal-token': token } : {}),
    }
  })
  if (!finalize.ok) throw new Error(`Finalize failed: ${finalize.status}`)
  return finalize.json()
}

// Frontend-only file storage for system files
class LocalFileStore {
  private files: Map<string, string> = new Map()
  private listeners: Set<() => void> = new Set()

  addFile(path: string, content: string): void {
    this.files.set(path, content)
    this.notifyListeners()
  }

  addFiles(entries: Array<{ path: string; content: string }>): void {
    for (const { path, content } of entries) {
      this.files.set(path, content)
    }
    this.notifyListeners()
  }

  getFile(path: string): string | undefined {
    return this.files.get(path)
  }

  getAllFiles(): Array<{ path: string; content: string }> {
    return Array.from(this.files.entries()).map(([path, content]) => ({ path, content }))
  }

  deleteFile(path: string): void {
    this.files.delete(path)
    this.notifyListeners()
  }

  addListener(callback: () => void): void {
    this.listeners.add(callback)
  }

  removeListener(callback: () => void): void {
    this.listeners.delete(callback)
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback())
  }

  // Convert to FileNode tree structure
  toFileTree(): FileNode {
    const files = this.getAllFiles()
    
    if (files.length === 0) {
      return {
        type: 'folder',
        name: 'workspace',
        path: '',
        children: []
      }
    }

    const children: FileNode[] = files.map(({ path }) => ({
      type: 'file',
      name: path,
      path: path
    }))

    return {
      type: 'folder',
      name: 'workspace',
      path: '',
      children
    }
  }
}

export const localFileStore = new LocalFileStore()

export function addLocalFile(path: string, content: string): void {
  localFileStore.addFile(path, content)
}

export function addLocalFiles(entries: Array<{ path: string; content: string }>): void {
  localFileStore.addFiles(entries)
}

export function renameLocalFile(oldPath: string, newPath: string): boolean {
  const content = localFileStore.getFile(oldPath)
  if (content === undefined) return false
  localFileStore.deleteFile(oldPath)
  localFileStore.addFile(newPath, content)
  return true
}

export function deleteLocalFile(path: string): boolean {
  const content = localFileStore.getFile(path)
  if (content === undefined) return false
  localFileStore.deleteFile(path)
  return true
}

export async function listFiles(): Promise<FileNode> {
  try {
    console.log('🔍 API: Attempting to load files from backend:', BACKEND_URL);
    
    const authUser = localStorage.getItem('auth_user')
    const parsed = authUser ? JSON.parse(authUser) : null
    const sessionId = parsed?.sessionId || null
    const terminalToken = parsed?.terminalToken || null
    
    console.log('🔑 API: Session ID for request:', sessionId)
    
    const headers: Record<string, string> = {}
    if (sessionId) headers['X-Session-Id'] = sessionId
    if (terminalToken) headers['X-Terminal-Token'] = terminalToken
    
    console.log('📡 API: Request headers:', headers)
    
    // Try to get backend files
    const response = await fetch(`${BACKEND_URL}/files`, {
      method: 'GET',
      headers
    })
    console.log('📡 API: Backend response status:', response.status);
    console.log('📡 API: Backend response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const data = await response.json() as { files: Array<{ filename: string }> }
      console.log('📁 API: Backend returned data:', data)
      console.log('📁 API: Files count:', data.files?.length || 0)
      console.log('📁 API: File names:', data.files?.map(f => f.filename) || [])
      console.log('📁 API: Sample file paths:', data.files?.slice(0, 5).map(f => f.filename) || [])
      
      // Optionally hide node_modules unless explicitly enabled
      const showNodeModules = (() => {
        try { return localStorage.getItem('show_node_modules') === 'true' } catch { return false }
      })()
      const filteredFilenames = data.files
        .map(f => f.filename)
        .filter(name => showNodeModules || (!name.startsWith('node_modules/') && !name.includes('/node_modules/')))

      const backendTree = buildTreeFromFlatList(filteredFilenames)
      console.log('📁 API: Built backend tree:', backendTree)
      console.log('📁 API: Backend tree children count:', backendTree.children?.length || 0)
      
      // Combine with local files
      const localFiles = localFileStore.toFileTree()
      console.log('📁 API: Local files tree:', localFiles)
      console.log('📁 API: Local files children count:', localFiles.children?.length || 0)
      
      const mergedChildren = mergeTrees(backendTree.children || [], localFiles.children || [])
      console.log('📁 API: Merged children count:', mergedChildren.length)
      console.log('📁 API: Merged children:', mergedChildren)
      
      const result: FileNode = { type: 'folder', name: 'workspace', path: '', children: mergedChildren }
      console.log('📁 API: Final result:', result)
      return result
    } else {
      console.error('❌ API: Backend responded with error status:', response.status);
      const errorText = await response.text()
      console.error('❌ API: Error response body:', errorText)
    }
  } catch (error) {
    console.error('❌ API: Error loading files from backend:', error);
    if (error instanceof Error) {
      console.error('❌ API: Error stack:', error.stack);
    }
    console.log('🔄 API: Falling back to local files only');
  }
  
  // Fallback to local files only
  const localFiles = localFileStore.toFileTree();
  console.log('📁 API: Using local files only:', localFiles);
  return localFiles;
}

export async function openFile(path: string): Promise<{ path: string; content: string }> {
  // Check local files first
  const localContent = localFileStore.getFile(path)
  if (localContent !== undefined) {
    return { path, content: localContent }
  }
  
  // Try backend if not in local storage
  try {
    const authUser = localStorage.getItem('auth_user')
    const parsed = authUser ? JSON.parse(authUser) : null
    const sessionId = parsed?.sessionId || null
    const terminalToken = parsed?.terminalToken || null
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sessionId) headers['X-Session-Id'] = sessionId
    if (terminalToken) headers['X-Terminal-Token'] = terminalToken
    
    const response = await fetch(`${BACKEND_URL}/files/open`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: path })
    })
    if (response.ok) {
      return response.json()
    }
  } catch (error) {
    console.log('Backend not available for file:', path)
  }
  
  throw new Error(`File not found: ${path}`)
}

export async function saveFile(path: string, content: string): Promise<void> {
  const authUser = localStorage.getItem('auth_user')
  const parsed = authUser ? JSON.parse(authUser) : null
  const sessionId = parsed?.sessionId || null
  const terminalToken = parsed?.terminalToken || null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sessionId) headers['X-Session-Id'] = sessionId
  if (terminalToken) headers['X-Terminal-Token'] = terminalToken
  
  const response = await fetch(`${BACKEND_URL}/files/save`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filename: path, content })
  })
  if (!response.ok) throw new Error('Failed to save file')
}

export async function deleteFile(path: string): Promise<void> {
  const authUser = localStorage.getItem('auth_user')
  const parsed = authUser ? JSON.parse(authUser) : null
  const sessionId = parsed?.sessionId || null
  const terminalToken = parsed?.terminalToken || null
  const headers: Record<string, string> = {}
  if (sessionId) headers['X-Session-Id'] = sessionId
  if (terminalToken) headers['X-Terminal-Token'] = terminalToken
  
  const response = await fetch(`${BACKEND_URL}/files/${encodeURIComponent(path)}`, {
    method: 'DELETE',
    headers
  })
  if (!response.ok) throw new Error('Failed to delete file')
}

export async function createFolder(folderPath: string): Promise<void> {
  const authUser = localStorage.getItem('auth_user')
  const parsed = authUser ? JSON.parse(authUser) : null
  const sessionId = parsed?.sessionId || null
  const terminalToken = parsed?.terminalToken || null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sessionId) headers['X-Session-Id'] = sessionId
  if (terminalToken) headers['X-Terminal-Token'] = terminalToken
  const response = await fetch(`${BACKEND_URL}/folders/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ folderPath })
  })
  if (!response.ok) throw new Error('Failed to create folder')
}


// Helpers: build a hierarchical tree from flat filenames
function buildTreeFromFlatList(paths: string[]): FileNode {
  console.log('🌳 buildTreeFromFlatList: Input paths:', paths)
  const root: FileNode = { type: 'folder', name: 'workspace', path: '', children: [] }
  
  for (const p of paths) {
    console.log(`🌳 Processing path: "${p}"`)
    const parts = p.split('/').filter(Boolean)
    console.log(`🌳 Path parts:`, parts)
    
    let current = root
    let currentPath = ''
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      currentPath = currentPath ? `${currentPath}/${part}` : part
      
      console.log(`🌳  Processing part "${part}" (isLast: ${isLast}, currentPath: "${currentPath}")`)
      
      if (!current.children) current.children = []
      let next = current.children.find(c => c.name === part)
      
      if (!next) {
        next = {
          type: isLast ? 'file' : 'folder',
          name: part,
          path: currentPath,
          children: isLast ? undefined : []
        }
        console.log(`🌳  Created new node:`, next)
        current.children.push(next)
      } else {
        console.log(`🌳  Found existing node:`, next)
      }
      current = next
    }
  }
  
  console.log('🌳 Final tree structure:', root)
  return root
}

function mergeTrees(a: FileNode[], b: FileNode[]): FileNode[] {
  const map = new Map<string, FileNode>()
  const insert = (node: FileNode) => {
    const key = `${node.type}:${node.path}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, JSON.parse(JSON.stringify(node)))
    } else if (node.type === 'folder') {
      const mergedChildren = mergeTrees(existing.children || [], node.children || [])
      existing.children = mergedChildren
    }
  }
  a.forEach(insert)
  b.forEach(insert)
  return Array.from(map.values()).sort((x, y) => {
    if (x.type !== y.type) return x.type === 'folder' ? -1 : 1
    return x.name.localeCompare(y.name)
  })
}

export async function uploadFilesWithPaths(files: File[], relPaths: string[]): Promise<void> {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))
  formData.append('paths', JSON.stringify(relPaths))

  const authUser = localStorage.getItem('auth_user')
  const sessionId = authUser ? JSON.parse(authUser).sessionId : null
  const token = authUser ? JSON.parse(authUser).terminalToken : null
  const headers: Record<string, string> = {}
  if (sessionId) headers['X-Session-Id'] = sessionId
  if (token) headers['X-Terminal-Token'] = token

  const response = await fetch(`${BACKEND_URL}/files/upload`, {
    method: 'POST',
    headers,
    body: formData
  })
  if (!response.ok) throw new Error('Failed to upload files')
}

export async function runCode(language: string, code: string): Promise<{ stdout: string; stderr: string }> {
  const response = await fetch(`${BACKEND_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code })
  })
  if (!response.ok) throw new Error('Failed to run code')
  return response.json()
}

// Compress and store node_modules for faster restoration
export async function compressNodeModules(nodeModulesData: { [path: string]: string }): Promise<any> {
  const authUser = localStorage.getItem('auth_user')
  const sessionId = authUser ? JSON.parse(authUser).sessionId : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (sessionId) headers['x-session-id'] = sessionId

  const response = await fetch(`${BACKEND_URL}/files/compress-node-modules`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nodeModulesData })
  })
  if (!response.ok) throw new Error('Failed to compress node_modules')
  return response.json()
}

// Restore node_modules from compressed storage
export async function restoreNodeModules(): Promise<any> {
  const authUser = localStorage.getItem('auth_user')
  const sessionId = authUser ? JSON.parse(authUser).sessionId : null
  const headers: Record<string, string> = {}
  if (sessionId) headers['x-session-id'] = sessionId

  const response = await fetch(`${BACKEND_URL}/files/restore-node-modules`, {
    method: 'POST',
    headers
  })
  if (!response.ok) throw new Error('Failed to restore node_modules')
  return response.json()
}

export async function runPythonCode(code: string, stdin?: string, timeout?: number): Promise<{ stdout: string; stderr: string }> {
  const response = await fetch(`${BACKEND_URL}/run/python`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, stdin, timeout })
  })
  if (!response.ok) throw new Error('Failed to run Python code')
  return response.json()
}

export function connectPythonTerminal(onMessage: (data: string) => void, onOpen: () => void, onClose: () => void): WebSocket {
  const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
  const ws = new WebSocket(`${wsUrl}/terminal`)
  ws.onopen = onOpen
  ws.onmessage = (event) => onMessage(event.data)
  ws.onclose = onClose
  ws.onerror = (error) => console.error('WebSocket error:', error)
  return ws
}

// Terminal-specific functions
export async function runPython(code: string, stdin?: string, timeout?: number): Promise<{ stdout: string; stderr: string }> {
  return runPythonCode(code, stdin, timeout)
}

export function openPythonSocket(): WebSocket {
  const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
  return new WebSocket(`${wsUrl}/terminal`)
}

// Ensure session exists and is valid - recover from localStorage or create new
export async function ensureSession(): Promise<{ userId: string; sessionId: string; terminalToken: string; workspacePath: string } | null> {
  try {
    // First, try to get existing session from localStorage
    const authUser = localStorage.getItem('auth_user')
    if (authUser) {
      try {
        const parsed = JSON.parse(authUser)
        if (parsed.sessionId && parsed.terminalToken) {
          console.log('✅ Found existing session in localStorage:', { sessionId: parsed.sessionId, hasToken: !!parsed.terminalToken })
          return parsed
        }
      } catch (error) {
        console.error('❌ Error parsing auth_user from localStorage:', error)
      }
    }

    // Try to recover session using stored Google profile
    const googleProfile = localStorage.getItem('google_profile')
    if (googleProfile) {
      try {
        const profile = JSON.parse(googleProfile)
        console.log('🔄 Attempting to recover session using Google profile:', profile)
        
        const response = await fetch(`${BACKEND_URL}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleId: profile.googleId,
            email: profile.email
          })
        })
        
        if (response.ok) {
          const sessionData = await response.json()
          console.log('✅ Session recovered from backend:', sessionData)
          
          // Store the recovered session
          const userData = {
            userId: sessionData.userId,
            sessionId: sessionData.sessionId,
            terminalToken: sessionData.terminalToken,
            workspacePath: sessionData.workspacePath,
            email: profile.email,
            googleId: profile.googleId
          }
          localStorage.setItem('auth_user', JSON.stringify(userData))
          return userData
        }
      } catch (error) {
        console.error('❌ Error recovering session with Google profile:', error)
      }
    }

    console.log('❌ No valid session found and unable to recover')
    return null
  } catch (error) {
    console.error('❌ Error in ensureSession:', error)
    return null
  }
}

// Logout: clear persisted auth and redirect to login
export function logout(): void {
  try {
    localStorage.removeItem('auth_user')
    localStorage.removeItem('google_profile')
    localStorage.removeItem('sessionId')
  } catch {}
  window.location.replace('/login')
}

