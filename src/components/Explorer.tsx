import { useState, useEffect } from 'react'
import { Folder, File, ChevronRight, ChevronDown, Upload, FolderOpen, FileText, RotateCcw, FolderPlus, Search, X } from 'lucide-react'
import { listFiles, openFile, localFileStore, renameLocalFile, deleteLocalFile, saveFile, deleteFile, createFolder, BACKEND_URL, uploadFilesWithPaths, restoreNodeModules, uploadZippedWorkspace, uploadZipInChunks } from '../lib/api'
// @ts-ignore types may not be present; runtime import is fine
import { zip } from 'fflate'

export type FileNode = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  expanded?: boolean
}

export function Explorer({ onOpen, onOpenSystem }: { onOpen: (path: string, content?: string) => void, onOpenSystem: () => void }) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredFiles, setFilteredFiles] = useState<FileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')

  // Load files from workspace and subscribe to local store changes
  useEffect(() => {
    loadWorkspaceFiles()
    const listener = () => loadWorkspaceFiles()
    localFileStore.addListener(listener)
    
    // Listen for refresh-files event
    const handleRefreshFiles = () => {
      console.log('🔄 Explorer: Refreshing files...')
      loadWorkspaceFiles()
    }
    window.addEventListener('refresh-files', handleRefreshFiles)
    
    return () => {
      localFileStore.removeListener(listener)
      window.removeEventListener('refresh-files', handleRefreshFiles)
    }
  }, [])

  // Filter files based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFiles(files)
      return
    }

    const filterNode = (node: FileNode): FileNode | null => {
      if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return node
      }
      
      if (node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter((child): child is FileNode => child !== null)
        
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
      }
      
      return null
    }

    const filtered = files
      .map(filterNode)
      .filter((node): node is FileNode => node !== null)
    
    setFilteredFiles(filtered)
  }, [files, searchQuery])

  async function loadWorkspaceFiles() {
    try {
      setLoading(true)
      const workspaceFiles = await listFiles()
      // listFiles returns a single FileNode representing the workspace root
      // Show the root folder explicitly so users see the workspace container
      const root = workspaceFiles ? { ...workspaceFiles, expanded: true } : null
      setFiles(root ? [root] : [])
    } catch (error) {
      console.error('Failed to load workspace files:', error)
      setFiles([]) // Start with empty state
    } finally {
      setLoading(false)
    }
  }

  // Background extraction system for large files
  const extractInBackground = async (files: File[]): Promise<{ [path: string]: string }> => {
    const extractedFiles: { [path: string]: string } = {}
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB limit per file
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024 // 100MB total limit
    let totalSize = 0
    let skippedFiles = 0
    
    console.log('🔄 Starting background extraction of', files.length, 'files...')
    
    for (const file of files) {
      try {
        const path = file.webkitRelativePath || file.name
        
        // Skip if already processed
        if (extractedFiles[path]) continue
        
        // Check file size limits
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`⚠️ Skipping large file (${(file.size / 1024 / 1024).toFixed(1)}MB):`, path)
          skippedFiles++
          continue
        }
        
        if (totalSize + file.size > MAX_TOTAL_SIZE) {
          console.warn(`⚠️ Total size limit reached. Skipping remaining files.`)
          skippedFiles += files.length - Object.keys(extractedFiles).length
          break
        }
        
        // Normalize path for consistent matching
        const normPath = path.replace(/\\/g, '/')

        // Smart file filtering - keep essential files, skip others
        if (
          normPath.includes('/.git/') || normPath.startsWith('.git/') ||
          normPath.includes('/.idea/') || normPath.includes('/.vscode/') ||
          normPath.includes('/__MACOSX/') || normPath.endsWith('/.DS_Store') ||
          /(^|\/)Thumbs\.db$/i.test(normPath) || /(^|\/)desktop\.ini$/i.test(normPath) ||
          /\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|mp4|mp3|zip|tar|gz)$/i.test(normPath)
        ) {
          console.log(`⏭️ Skipping binary/system file:`, normPath)
          skippedFiles++
          continue
        }
        
        // Handle node_modules specially - keep package.json and lock files
        if (normPath.includes('node_modules/')) {
          // Keep package.json, package-lock.json, yarn.lock from node_modules root
          if (normPath.endsWith('package.json') || 
              normPath.endsWith('package-lock.json') || 
              normPath.endsWith('yarn.lock') ||
              normPath.endsWith('pnpm-lock.yaml')) {
            console.log(`📦 Keeping essential node_modules file:`, normPath)
            // Continue processing this file
          } else {
            console.log(`⏭️ Skipping node_modules file:`, normPath)
            skippedFiles++
            continue
          }
        }
        
        // For large files, extract in chunks to prevent memory issues
        if (file.size > 2 * 1024 * 1024) { // 2MB threshold
          console.log('📦 Extracting large file in background:', path)
          
          // Read file in chunks
          const chunks: string[] = []
          const chunkSize = 512 * 1024 // 512KB chunks
          let offset = 0
          
          while (offset < file.size) {
            const chunk = file.slice(offset, offset + chunkSize)
            const text = await chunk.text()
            chunks.push(text)
            offset += chunkSize
            
            // Yield control to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 10))
          }
          
          extractedFiles[path] = chunks.join('')
        } else {
          // Small files - read directly
          extractedFiles[path] = await file.text()
        }
        
        totalSize += file.size
        
        // Update progress
        const progress = Object.keys(extractedFiles).length / files.length * 100
        console.log(`📊 Extraction progress: ${progress.toFixed(1)}% (${Object.keys(extractedFiles).length}/${files.length} files)`)
        
      } catch (error) {
        console.error('❌ Error extracting file:', file.name, error)
        skippedFiles++
        // Continue with other files
      }
    }
    
    console.log(`✅ Background extraction complete: ${Object.keys(extractedFiles).length} files extracted, ${skippedFiles} files skipped`)
    if (skippedFiles > 0) {
      console.log(`ℹ️ Skipped files include: node_modules (except package.json), binary files, and files over 10MB`)
      console.log(`💡 Tip: Use the "📦 Restore" button to restore node_modules after upload`)
    }
    
    return extractedFiles
  }

  // Single API call to save entire workspace with proper session handling
  const saveEntireWorkspace = async (workspaceData: { [path: string]: string }) => {
    try {
      console.log('💾 Saving entire workspace in single API call...')
      
      // Get session ID from localStorage
      const authUser = localStorage.getItem('auth_user')
      const sessionId = authUser ? JSON.parse(authUser).sessionId : null
      
      if (!sessionId) {
        throw new Error('No session ID found. Please log in again.')
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-session-id': sessionId,
      }
      try {
        const authUserTok = localStorage.getItem('auth_user')
        const token = authUserTok ? JSON.parse(authUserTok).terminalToken : undefined
        if (token) (headers as any)['x-terminal-token'] = token
      } catch {}
      
      const response = await fetch(`${BACKEND_URL}/files/workspace`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workspace: workspaceData,
          timestamp: Date.now()
        })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      console.log('✅ Workspace saved successfully:', result)
      return result
      
    } catch (error) {
      console.error('❌ Error saving workspace:', error)
      throw error
    }
  }

  // Open file picker for single file
  async function openFilePicker() {
    try {
      if ('showOpenFilePicker' in window) {
        const fileHandles = await (window as any).showOpenFilePicker({
          multiple: true, // Allow multiple file selection
          types: [
            {
              description: 'Code Files',
              accept: {
                'text/x-python': ['.py'],
                'text/javascript': ['.js', '.ts'],
                'text/x-c': ['.c', '.cpp', '.h', '.hpp'],
                'text/x-java-source': ['.java'],
                'text/html': ['.html', '.htm'],
                'text/css': ['.css'],
                'application/json': ['.json'],
                'text/plain': ['.txt', '.md']
              }
            }
          ]
        })
        
        // Open all selected files
        for (const fileHandle of fileHandles) {
          const file = await fileHandle.getFile()
          const content = await file.text()
          
          try {
            // Save to backend database in real-time
            await saveFile(file.name, content)
            
            // Also persist into local workspace
          localFileStore.addFile(file.name, content)
          onOpen(file.name, content)
            
            // Trigger file explorer refresh
            window.dispatchEvent(new Event('refresh-files'))
          } catch (error) {
            console.error('Failed to save file:', error)
            alert(`Failed to save ${file.name}. Please try again.`)
          }
        }
      } else {
        // Fallback for browsers without File System Access API
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true // Allow multiple file selection
        input.accept = '.py,.js,.ts,.c,.cpp,.h,.hpp,.java,.html,.css,.json,.txt,.md'
        input.onchange = async (e) => {
          const target = e.target as HTMLInputElement
          if (target.files) {
            const fileList = Array.from(target.files)
            // Open all selected files
            for (const file of fileList) {
              const content = await file.text()
              
              try {
                // Save to backend database in real-time
                await saveFile(file.name, content)
                
                // Also persist into local workspace
              localFileStore.addFile(file.name, content)
              onOpen(file.name, content)
              } catch (error) {
                console.error('Failed to save file:', error)
                alert(`Failed to save ${file.name}. Please try again.`)
              }
            }
            setTimeout(() => window.dispatchEvent(new Event('explorer-refresh')), 100)
          }
        }
        input.click()
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error opening file:', error)
        alert('Failed to open file. Please try again.')
      }
    }
  }

  // Open folder picker
  async function openFolderPicker() {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker()
        
        // Recursively read directory contents
        const folderContents = await readDirectoryRecursively(dirHandle)
        setFiles(folderContents)
        
        // Persist all files into local store and backend
        const filesOnly: Array<{ path: string; content: string }> = []
        for (const node of flatten(folderContents)) {
          if (node.type === 'file') {
            try {
              const file = await getFileFromDirectory(dirHandle, node.path)
              const content = await file.text()
              filesOnly.push({ path: node.path, content })
              
              // Save to backend database in real-time
              await saveFile(node.path, content)
            } catch (error) {
              console.error(`Failed to save ${node.path}:`, error)
            }
          }
        }
        if (filesOnly.length) {
          localFileStore.addFiles(filesOnly)
          // Trigger file explorer refresh
          window.dispatchEvent(new Event('refresh-files'))
        }
        
        // Open the first file automatically
        const first = filesOnly[0]
        if (first) onOpen(first.path, first.content)
      } else {
        // Fallback for browsers without File System Access API
        const input = document.createElement('input')
        input.type = 'file'
        input.webkitdirectory = true
        input.multiple = true
        input.onchange = async (e) => {
          const target = e.target as HTMLInputElement
          if (target.files) {
            const fileList = Array.from(target.files)
            const folderStructure = buildFolderStructure(fileList)
            setFiles(folderStructure)
            
            const entries: Array<{ path: string; content: string }> = []
            for (const f of fileList) {
              try {
                const content = await f.text()
                const path = f.webkitRelativePath || f.name
                entries.push({ path, content })
                
                // Save to backend database in real-time
                await saveFile(path, content)
              } catch (error) {
                console.error(`Failed to save ${f.name}:`, error)
              }
            }
            if (entries.length) {
              localFileStore.addFiles(entries)
              // Trigger file explorer refresh
              window.dispatchEvent(new Event('refresh-files'))
            }
            const first = entries[0]
            if (first) onOpen(first.path, first.content)
          }
        }
        input.click()
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error opening folder:', error)
        alert('Failed to open folder. Please try again.')
      }
    }
  }

  // Recursively read directory contents
  async function readDirectoryRecursively(dirHandle: any, parentPath = ''): Promise<FileNode[]> {
    const nodes: FileNode[] = []
    
    for await (const [name, handle] of dirHandle.entries()) {
      const path = parentPath ? `${parentPath}/${name}` : name
      
      if (handle.kind === 'directory') {
        const children = await readDirectoryRecursively(handle, path)
        nodes.push({
          name,
          path,
          type: 'folder',
          children,
          expanded: false
        })
      } else {
        nodes.push({
          name,
          path,
          type: 'file'
        })
      }
    }
    
    return nodes.sort((a, b) => {
      // Folders first, then files
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  function flatten(nodes: FileNode[]): FileNode[] {
    const out: FileNode[] = []
    for (const n of nodes) {
      out.push(n)
      if (n.children) out.push(...flatten(n.children))
    }
    return out
  }

  // Traverse File System Access API directory by a relative path (supports nested folders)
  async function getFileFromDirectory(dirHandle: any, relativePath: string): Promise<File> {
    const parts = relativePath.split('/').filter(Boolean)
    let current: any = dirHandle
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (isLast) {
        const fileHandle = await current.getFileHandle(part)
        return fileHandle.getFile()
      } else {
        current = await current.getDirectoryHandle(part)
      }
    }
    throw new Error(`Invalid path: ${relativePath}`)
  }

  // Build folder structure from FileList (fallback)
  function buildFolderStructure(fileList: File[]): FileNode[] {
    const structure: { [key: string]: FileNode } = {}
    
    fileList.forEach(file => {
      const pathParts = (file.webkitRelativePath || file.name).split('/')
      let currentPath = ''
      
      pathParts.forEach((part, index) => {
        const isLast = index === pathParts.length - 1
        const fullPath = currentPath ? `${currentPath}/${part}` : part
        
        if (!structure[fullPath]) {
          structure[fullPath] = {
            name: part,
            path: fullPath,
            type: isLast ? 'file' : 'folder',
            children: isLast ? undefined : [],
            expanded: false
          }
        }
        
        if (!isLast && structure[currentPath]) {
          if (!structure[currentPath].children) {
            structure[currentPath].children = []
          }
          structure[currentPath].children!.push(structure[fullPath])
        }
        
        currentPath = fullPath
      })
    })
    
    // Return only root level items
    return Object.values(structure).filter(node => 
      !node.path.includes('/')
    ).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  // Toggle folder expansion
  function toggleFolder(node: FileNode) {
    if (node.type === 'folder') {
      node.expanded = !node.expanded
      setFiles([...files]) // Trigger re-render
    }
  }

  // Handle file/folder click
  function handleNodeClick(node: FileNode) {
    if (node.type === 'folder') {
      toggleFolder(node)
    } else {
      openFileFromWorkspace(node.path)
    }
    setSelectedPath(node.path)
  }

  // Handle file double-click (open file)
  function handleNodeDoubleClick(node: FileNode) {
    if (node.type === 'file') {
      openFileFromWorkspace(node.path)
    }
  }

  // Open file from workspace
  async function openFileFromWorkspace(path: string) {
    try {
      const fileData = await openFile(path)
      onOpen(path, fileData.content)
    } catch (error) {
      console.warn(`Could not open ${path} from workspace:`, error)
      // File might not exist in workspace, that's okay
    }
  }

  // Refresh workspace
  function refreshWorkspace() {
    loadWorkspaceFiles()
  }

  // Clear search
  function clearSearch() {
    setSearchQuery('')
  }

  return (
    <div className="h-full flex flex-col" onContextMenu={(e) => e.preventDefault()} onClick={() => setMenu(null)}     onDrop={async (e) => {
      e.preventDefault()
      const items = e.dataTransfer?.items
      if (!items) return
      
      console.log('🎯 Drag & Drop: Processing dropped items...')
      
      const filesToUpload: File[] = []
      const relativePaths: string[] = []
      const folderStructure: { [key: string]: any } = {}
      
      // Helper function to traverse file tree and preserve folder structure
      const traverseFileTree = async (entry: any, basePath: string = '') => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            entry.file(resolve)
          })
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
          filesToUpload.push(file)
          relativePaths.push(relativePath)
          
          console.log(`📄 File: ${relativePath}`)
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader()
          const entries = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(resolve)
          })
          
          // Create folder structure
          const folderPath = basePath ? `${basePath}/${entry.name}` : entry.name
          folderStructure[folderPath] = {
            name: entry.name,
            path: folderPath,
            type: 'folder',
            children: []
          }
          
          console.log(`📁 Folder: ${folderPath}`)
          
          // Create folder placeholder in database
          try {
            await createFolder(folderPath)
          } catch (error) {
            console.log('Folder already exists or error creating:', error)
          }
          
          // Recursively process all entries in the directory
          for (const subEntry of entries) {
            await traverseFileTree(subEntry, folderPath)
          }
        }
      }
      
      // Process all dropped items
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry()
          if (entry) {
            await traverseFileTree(entry, '')
          } else {
            // Fallback for single files
            const file = item.getAsFile()
            if (file) {
              filesToUpload.push(file)
              relativePaths.push(file.name)
              console.log(`📄 Single file: ${file.name}`)
            }
          }
        }
      }
      
      if (filesToUpload.length > 0) {
        try {
          console.log(`📤 Processing ${filesToUpload.length} files with optimized upload...`)
          
          // Show progress indicator to user
          const progressDiv = document.createElement('div')
          progressDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #1e1e1e; color: white; padding: 15px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: monospace;
            min-width: 300px; max-width: 500px;
          `
          progressDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px;">📤 Uploading ${filesToUpload.length} files...</div>
            <div id="upload-progress">🔄 Extracting files...</div>
            <div style="margin-top: 10px; font-size: 12px; color: #888;">
              Large projects may take a few minutes. Please don't refresh the page.
            </div>
          `
          document.body.appendChild(progressDiv)
          
          // If folder drag detected, zip whole folder client-side and upload once
          const isFolderDrag = filesToUpload.some(f => (f as any).webkitRelativePath && (f as any).webkitRelativePath.includes('/'))
          if (isFolderDrag) {
            const progressElement = document.getElementById('upload-progress')
            if (progressElement) progressElement.textContent = `📦 Zipping folder...`
            const entries: Record<string, Uint8Array> = {}
            for (const f of filesToUpload) {
              const rel = ((f as any).webkitRelativePath || f.name).replace(/^\/+/, '').replace(/\\/g, '/')
              if (rel.includes('/.git/') || rel.includes('/.vscode/') || rel.includes('/__MACOSX/') || /(^|\/)Thumbs\.db$/i.test(rel) || rel.endsWith('/.DS_Store')) continue
              const u8 = new Uint8Array(await f.arrayBuffer())
              entries[rel] = u8
            }
            const zipBytes: Uint8Array = await new Promise((resolve, reject) => {
              zip(entries, { level: 6 }, (err: unknown, data: Uint8Array) => err ? reject(err) : resolve(data))
            })
            if (progressElement) progressElement.textContent = `⬆️ Uploading zip (${(zipBytes.byteLength/1024/1024).toFixed(1)} MB)...`
            const projectRoot = ((filesToUpload[0] as any).webkitRelativePath?.split('/')[0]) || 'workspace'
            const authUser = localStorage.getItem('auth_user')
            const sessionId = authUser ? JSON.parse(authUser).sessionId : undefined
            if (zipBytes.byteLength > 150 * 1024 * 1024) {
              await uploadZipInChunks(zipBytes, projectRoot, sessionId)
            } else {
              await uploadZippedWorkspace(zipBytes, projectRoot, sessionId)
            }
            window.dispatchEvent(new Event('refresh-files'))
            const pd = document.querySelector('div[style*="position: fixed"]') as HTMLElement | null
            if (pd && pd.parentNode) pd.parentNode.removeChild(pd)
            console.log('✅ Drag & Drop ZIP upload completed')
            return
          }
          
          // Extract all files in background (prevents memory issues)
          const extractedFiles = await extractInBackground(filesToUpload)
          
          // Update progress
          const progressElement = document.getElementById('upload-progress')
          if (progressElement) {
            progressElement.textContent = `💾 Saving ${Object.keys(extractedFiles).length} files to database...`
          }
          
          // Decide fast path for large uploads
          const totalFiles = Object.keys(extractedFiles).length
          const totalSize = Object.values(extractedFiles).reduce((acc, v) => acc + (v?.length || 0), 0)
          const useFastPath = totalFiles > 300 || totalSize > 50 * 1024 * 1024

          if (useFastPath) {
            if (progressElement) progressElement.textContent = `⚡ Using fast save for ${totalFiles} files...`
            const authUser = localStorage.getItem('auth_user')
            const sessionId = authUser ? JSON.parse(authUser).sessionId : null
            const headers: Record<string, string> = { 'Content-Type': 'application/json' }
            if (sessionId) headers['x-session-id'] = sessionId
            try {
              const authUserTok = localStorage.getItem('auth_user')
              const token = authUserTok ? JSON.parse(authUserTok).terminalToken : undefined
              if (token) (headers as any)['x-terminal-token'] = token
            } catch {}
            const resp = await fetch(`${BACKEND_URL}/files/workspace-fast`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ workspace: extractedFiles, timestamp: Date.now() })
            })
            if (!resp.ok) throw new Error(`Fast save failed: ${resp.status}`)
          } else {
          // Save entire workspace in ONE API call (prevents server overload)
          await saveEntireWorkspace(extractedFiles)
          }
          
          // Update progress
          if (progressElement) {
            progressElement.textContent = `✅ Upload complete! Refreshing workspace...`
          }
          
          // Check if we have package.json and need to restore node_modules
          const hasPackageJson = Object.keys(extractedFiles).some(path => 
            path.endsWith('package.json') && !path.includes('node_modules/')
          )
          
          if (hasPackageJson) {
            if (progressElement) {
              progressElement.textContent = `📦 Detected package.json - setting up npm install...`
            }
            
            // Notify terminal to run npm install
            window.dispatchEvent(new CustomEvent('terminal-npm-install', { 
              detail: { 
                message: 'Project uploaded! Run "npm install" to restore dependencies.',
                autoInstall: true
              } 
            }))
          }
          
          // Update terminal working directory to match the uploaded files
          const firstFile = relativePaths[0]
          if (firstFile) {
            const fileDir = firstFile.includes('/') ? firstFile.substring(0, firstFile.lastIndexOf('/')) : ''
            if (fileDir) {
              // Notify terminal to change working directory
              window.dispatchEvent(new CustomEvent('terminal-change-dir', { 
                detail: { directory: fileDir } 
              }))
              console.log(`📁 Terminal working directory updated to: ${fileDir}`)
            }
          }
          
          // Refresh file explorer
          window.dispatchEvent(new Event('refresh-files'))
          
          // Remove progress indicator after a delay
          setTimeout(() => {
            if (progressDiv.parentNode) {
              progressDiv.parentNode.removeChild(progressDiv)
            }
          }, 2000)
          
          console.log('✅ Drag & Drop completed successfully - No server overload!')
        } catch (err) {
          console.error('❌ Upload failed:', err)
          
          // Remove progress indicator on error
          const progressDiv = document.querySelector('div[style*="position: fixed"]')
          if (progressDiv) {
            progressDiv.remove()
          }
          
          // Show detailed error message
          const errorMessage = (err as Error).message.includes('session') 
            ? 'Please log in again and try uploading your files.'
            : `Upload failed: ${(err as Error).message}`
            
          alert(errorMessage)
        }
      }
    }} onDragOver={(e) => e.preventDefault()}>
      {/* Explorer Header */}
      <div className="explorer-header">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--muted)]">EXPLORER</span>
          <button
            onClick={refreshWorkspace}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-fast"
            title="Refresh"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={openFilePicker}
            className="vscode-button"
            title="Open File"
          >
            <FileText size={14} />
            File
          </button>
          <button
            onClick={openFolderPicker}
            className="vscode-button"
            title="Open Folder"
          >
            <FolderOpen size={14} />
            Folder
          </button>
          <button
            onClick={async () => {
              const name = prompt('New file name (e.g., main.py):', 'untitled.py') || 'untitled.py'
              try {
                // Save to backend database in real-time
                await saveFile(name, '')
                
                // Also persist into local workspace
              localFileStore.addFile(name, '')
              onOpen(name, '')
                
                // Trigger file explorer refresh
                window.dispatchEvent(new Event('refresh-files'))
              } catch (error) {
                console.error('Failed to create new file:', error)
                alert('Failed to create new file. Please try again.')
              }
            }}
            className="vscode-button"
            title="New File"
          >
            + New
          </button>
          <button
            onClick={async () => {
              const name = prompt('New folder name:', 'folder') || 'folder'
              try {
                await createFolder(name)
                // reflect immediately in local store as empty folder placeholder
              localFileStore.addFile(`${name}/.placeholder`, '')
              loadWorkspaceFiles()
                window.dispatchEvent(new Event('refresh-files'))
              } catch (e) {
                console.error('Failed to create folder:', e)
                alert('Failed to create folder. Please try again.')
              }
            }}
            className="vscode-button"
            title="New Folder"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
          <button
            onClick={onOpenSystem}
            className="vscode-button"
            title="Open System Files"
          >
            <Upload size={14} />
            System
          </button>
          <button
            onClick={async () => {
              try {
                const result = await restoreNodeModules()
                alert(`✅ Dependencies restored! ${result.restored} files restored.`)
                window.dispatchEvent(new Event('refresh-files'))
              } catch (error) {
                console.error('Failed to restore dependencies:', error)
                alert('Failed to restore dependencies. Make sure you have uploaded a project with node_modules before.')
              }
            }}
            className="vscode-button"
            title="Restore Dependencies (node_modules)"
          >
            📦 Restore
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <div className="search-input-container">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="search-clear"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* File Tree */}
      <div className="file-tree flex-1 overflow-auto" onContextMenu={(e) => {
        e.preventDefault()
        const target = e.target as HTMLElement
        const item = target.closest('.file-item') as HTMLElement | null
        if (item) {
          const nodePath = item.dataset.path || ''
          const findNode = (nodes: FileNode[]): FileNode | null => {
            for (const n of nodes) {
              if (n.path === nodePath) return n
              if (n.children) {
                const c = findNode(n.children)
                if (c) return c
              }
            }
            return null
          }
          const node = findNode(filteredFiles)
          if (node) {
            setSelectedPath(node.path)
            setMenu({ x: e.clientX, y: e.clientY, node })
          }
        }
      }}>
        {loading ? (
          <div className="p-4 text-center text-[var(--muted)]">
            Loading workspace...
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-[var(--muted)]">
            <Folder size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              {searchQuery ? 'No files match your search' : 'No files opened'}
            </p>
            {!searchQuery && (
              <p className="text-xs mt-1">Use the buttons above to open files or folders</p>
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredFiles.map(node => (
              <Node 
                key={node.path} 
                node={node} 
                onToggle={toggleFolder}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                selectedPath={selectedPath}
                level={0}
              />
            ))}
          </div>
        )}
      </div>

      {menu && (
        <div className="absolute z-50 bg-[var(--panel)] border border-[var(--gutter)] rounded shadow" style={{ left: menu.x, top: menu.y }}>
          {menu.node.type === 'file' && (
            <>
          <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)]" onClick={async () => { await openFileFromWorkspace(menu.node.path); setMenu(null) }}>Open</button>
          <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)]" onClick={() => { const np = prompt('Rename file to:', menu.node.name); if (np && renameLocalFile(menu.node.path, np)) loadWorkspaceFiles(); setMenu(null) }}>Rename</button>
              <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)] text-[var(--error)]" onClick={async () => { 
                if (confirm('Delete file?')) { 
                  try {
                    await deleteFile(menu.node.path);
                    deleteLocalFile(menu.node.path);
                    loadWorkspaceFiles();
                    window.dispatchEvent(new Event('refresh-files'));
                  } catch (error) {
                    console.error('Failed to delete file:', error);
                    alert('Failed to delete file. Please try again.');
                  }
                } 
                setMenu(null) 
              }}>Delete</button>
            </>
          )}
          {menu.node.type === 'folder' && (
            <>
              <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)]" onClick={async () => { 
                const fileName = prompt('New file name:', 'untitled.txt') || 'untitled.txt'
                const path = `${menu.node.path ? menu.node.path + '/' : ''}${fileName}`
                try {
                  await saveFile(path, '')
                  localFileStore.addFile(path, '')
                  window.dispatchEvent(new Event('refresh-files'))
                } catch (e) {
                  alert('Failed to create file')
                }
                setMenu(null)
              }}>New File</button>
              <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)]" onClick={async () => { 
                const folderName = prompt('New folder name:', 'folder') || 'folder'
                const path = `${menu.node.path ? menu.node.path + '/' : ''}${folderName}`
                try {
                  await createFolder(path)
                  localFileStore.addFile(`${path}/.placeholder`, '')
                  window.dispatchEvent(new Event('refresh-files'))
                } catch (e) { alert('Failed to create folder') }
                setMenu(null)
              }}>New Folder</button>
              <button className="block w-full text-left px-3 py-2 hover:bg-[var(--gutter)] text-[var(--error)]" onClick={async () => { 
                if (confirm('Delete folder and its contents?')) { 
                  try {
                    const authUser = localStorage.getItem('auth_user')
                    const sessionId = authUser ? JSON.parse(authUser).sessionId : null
                    await fetch(`${BACKEND_URL}/folders/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sessionId ? { 'X-Session-Id': sessionId } : {}) }, body: JSON.stringify({ folderPath: menu.node.path }) })
                    // Clear local entries under this folder
                    const toDelete = (localFileStore.getAllFiles?.() || []).filter(e => e.path.startsWith(menu.node.path + '/'))
                    toDelete.forEach(e => deleteLocalFile(e.path))
                    window.dispatchEvent(new Event('refresh-files'))
                  } catch (e) { alert('Failed to delete folder') }
                }
                setMenu(null)
              }}>Delete Folder</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Recursive Node component
function Node({ 
  node, 
  onToggle, 
  onClick, 
  onDoubleClick, 
  level,
  selectedPath
}: { 
  node: FileNode
  onToggle: (node: FileNode) => void
  onClick: (node: FileNode) => void
  onDoubleClick: (node: FileNode) => void
  level: number,
  selectedPath: string
}) {
  const isFolder = node.type === 'folder'
  const hasChildren = isFolder && node.children && node.children.length > 0
  const isExpanded = isFolder && node.expanded

  const fileEmoji = (name: string) => {
    const n = name.toLowerCase()
    if (n.endsWith('.py')) return '🐍'
    if (n.endsWith('.js')) return '🟨'
    if (n.endsWith('.ts')) return '🟦'
    if (n.endsWith('.jsx') || n.endsWith('.tsx')) return '⚛️'
    if (n.endsWith('.html')) return '🌐'
    if (n.endsWith('.css') || n.endsWith('.scss') || n.endsWith('.sass')) return '🎨'
    if (n.endsWith('.json')) return '🧾'
    if (n.endsWith('.md')) return '📝'
    if (n.endsWith('.c')) return '🔧'
    if (n.endsWith('.cpp') || n.endsWith('.cc') || n.endsWith('.cxx')) return '🧩'
    if (n.endsWith('.h') || n.endsWith('.hpp')) return '📘'
    if (n.endsWith('.java')) return '☕'
    if (n.endsWith('.go')) return '🐹'
    if (n.endsWith('.rs')) return '🦀'
    if (n.endsWith('.php')) return '🐘'
    if (n.endsWith('.rb')) return '💎'
    if (n.endsWith('.sql')) return '🗄️'
    return '📄'
  }

  return (
    <div>
      <div 
        className={`file-item ${isFolder ? 'folder' : 'file'} ${selectedPath === node.path ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onClick(node)}
        onDoubleClick={() => onDoubleClick(node)}
        onContextMenu={(e) => { e.preventDefault(); }}
        data-path={node.path}
      >
        {isFolder && (
          <span className="file-icon">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        <span className="file-icon">
          {isFolder ? <Folder size={14} /> : <span>{fileEmoji(node.name)}</span>}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      
      {isFolder && isExpanded && hasChildren && (
        <div>
          {node.children!.map(child => (
            <Node
              key={child.path}
              node={child}
              onToggle={onToggle}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              level={level + 1}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

