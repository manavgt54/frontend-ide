import { useState, useEffect, useCallback, useRef } from 'react'
import { Folder, File, ChevronRight, ChevronDown, Upload, FolderOpen, FileText, RotateCcw, FolderPlus, Search, X, Cloud, CloudOff, CheckCircle, AlertCircle, Clock, Plus, Trash2, Edit3 } from 'lucide-react'
import { InputDialog } from './InputDialog'
import { 
  VirtualFileSystem, 
  FileMeta, 
  createVFS, 
  getCurrentVFS, 
  setCurrentVFS,
  db,
  FILE_STATUS 
} from '../lib/vfs'
import { FileWalker, walkDataTransfer, WalkResult, WalkProgress } from '../lib/fileWalker'
import { BatchUploader, createBatchUploader, UploadProgress, UploadStats } from '../lib/batchUploader'
import { saveFile, createFolder, deleteFile, restoreNodeModules, BACKEND_URL, localFileStore, listFiles, openFile as apiOpenFile } from '../lib/api'
// frontendLogger removed to fix WebSocket issues

export type FileNode = {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  expanded?: boolean
  status?: FileMeta['status']
  size?: number
  mtime?: number
}

export function ExplorerVFS({ onOpen, onOpenSystem }: { onOpen: (path: string, content?: string) => void, onOpenSystem: () => void }) {
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredFiles, setFilteredFiles] = useState<FileNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [vfs, setVFS] = useState<VirtualFileSystem | null>(null)
  const [uploader, setUploader] = useState<BatchUploader | null>(null)
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [walkProgress, setWalkProgress] = useState<WalkProgress | null>(null)
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptTitle, setPromptTitle] = useState<string>('')
  const [promptDefault, setPromptDefault] = useState<string>('')
  const promptCallbackRef = useRef<((value: string | null) => void) | null>(null)

  // Load files from workspace and subscribe to local store changes
  const loadWorkspaceFiles = useCallback(async () => {
    try {
      console.log('🔄 Starting loadWorkspaceFiles...')
      setLoading(true)
      
      // First try to load from backend with session persistence
      console.log('📡 Calling listFiles() from backend...')
      const workspaceFiles = await listFiles()
      console.log('🔍 Backend returned workspace files:', workspaceFiles)
      console.log('🔍 Workspace files type:', typeof workspaceFiles)
      console.log('🔍 Workspace files children count:', workspaceFiles?.children?.length || 0)
      
      if (workspaceFiles) {
        console.log('✅ Processing backend files...')
        // Convert backend FileNode to local FileNode with required id field
        const convertNode = (node: import('../lib/api').FileNode, depth = 0): FileNode => {
          const indent = '  '.repeat(depth)
          console.log(`${indent}🔄 Converting node: ${node.name} (${node.type}) at ${node.path}`)
          
          const converted = {
            id: node.path || node.name,
            name: node.name,
            path: node.path,
            type: node.type,
            children: node.children ? node.children.map(child => convertNode(child, depth + 1)) : undefined,
            expanded: false
          }
          
          console.log(`${indent}✅ Converted to:`, converted)
          return converted
        }

        const localRoot = convertNode(workspaceFiles)
        // Keep the root 'workspace' folder visible in the explorer tree
        const fileTree = [localRoot]
        console.log('📁 Final converted file tree:', fileTree)
        console.log('📁 File tree length:', fileTree.length)
        console.log('📁 Setting files state...')
        setFiles(fileTree)
        console.log('✅ Files state set successfully')
        
        // Also sync with VFS for instant access
        if (vfs && localRoot.children) {
          console.log('🔄 Syncing files to VFS...')
          for (const child of localRoot.children) {
            await syncFileToVFS(child)
          }
          console.log('✅ VFS sync completed')
        }
      } else {
        console.log('⚠️ No workspace files from backend, falling back to VFS...')
        // Fallback to VFS only
        if (vfs) {
          console.log('🔄 Getting files from VFS...')
          const fileMetas = await vfs.getProjectFiles()
          console.log('📁 VFS file metas:', fileMetas)
          const fileTree = buildFileTree(fileMetas)
          console.log('📁 VFS file tree:', fileTree)
          setFiles(fileTree)
        } else {
          console.log('⚠️ No VFS available, setting empty files')
          setFiles([])
        }
      }
    } catch (error: unknown) {
      console.error('❌ Failed to load workspace files:', error)
      console.error('❌ Error stack:', error instanceof Error ? error.stack : String(error))
      setFiles([])
    } finally {
      console.log('🏁 loadWorkspaceFiles completed')
      setLoading(false)
    }
  }, [vfs])

  // Sync file from backend to VFS
  const syncFileToVFS = useCallback(async (node: FileNode) => {
    if (!vfs) return
    
    try {
      if (node.type === 'file') {
        // Get file content
        const fileData = await apiOpenFile(node.path)
        
        // Add to VFS
        await vfs.addFileMeta({
          path: node.path,
          name: node.name,
          size: fileData.content.length,
          mtime: Date.now(),
          isDirectory: false,
          status: FILE_STATUS.COMMITTED
        })
        
        // Store content in VFS
        const content = new Blob([fileData.content], { type: 'text/plain' })
        await vfs.setFileContent(node.path, content)
      } else if (node.type === 'folder') {
        // Add folder to VFS
        await vfs.addFileMeta({
          path: node.path,
          name: node.name,
          size: 0,
          mtime: Date.now(),
          isDirectory: true,
          status: FILE_STATUS.COMMITTED
        })
        
        // Recursively sync children
        if (node.children) {
          for (const child of node.children) {
            await syncFileToVFS(child)
          }
        }
      }
    } catch (error) {
      console.error(`Failed to sync file ${node.path} to VFS:`, error)
    }
  }, [vfs])

  // Initialize VFS and uploader (run once)
  useEffect(() => {
    const projectId = 'workspace'
    const projectName = 'Workspace'
    
    const vfsInstance = createVFS(projectId, projectName)
    setVFS(vfsInstance)
    
    const uploaderInstance = createBatchUploader({
      baseUrl: BACKEND_URL,
      maxFilesPerBatch: 50,
      maxSizePerBatch: 20 * 1024 * 1024, // 20MB
      maxConcurrentBatches: 3
    })
    
    // Set up uploader event handlers
    uploaderInstance.onProgress = (progress: UploadProgress) => {
      console.log('Upload progress:', progress)
    }
    
    uploaderInstance.onBatchComplete = (result: any) => {
      console.log('Batch complete:', result)
      // Trigger a refresh without depending on loadWorkspaceFiles identity
      window.dispatchEvent(new Event('refresh-files'))
    }
    
    uploaderInstance.onError = (error: any) => {
      console.error('Upload error:', error)
      setIsUploading(false)
    }
    
    uploaderInstance.onStats = (stats: UploadStats) => {
      setUploadStats(stats)
    }
    
    setUploader(uploaderInstance)
    
    return () => {
      uploaderInstance.destroy()
    }
  }, [])

  // Guard refs to prevent refresh storms
  const refreshTimerRef = (typeof window !== 'undefined') ? (window as any).ReactRefreshTimerRef ?? { current: null as number | null } : { current: null as number | null }
  const isRefreshingRef = (typeof window !== 'undefined') ? (window as any).ReactIsRefreshingRef ?? { current: false } : { current: false }
  if (typeof window !== 'undefined') {
    ;(window as any).ReactRefreshTimerRef = refreshTimerRef
    ;(window as any).ReactIsRefreshingRef = isRefreshingRef
  }

  // Keep latest loader in a ref to avoid re-binding listeners
  const loadRef = { current: loadWorkspaceFiles }
  useEffect(() => {
    loadRef.current = loadWorkspaceFiles
  }, [loadWorkspaceFiles])

  // Stable debounced refresh (does not change identity across renders)
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = window.setTimeout(async () => {
      if (isRefreshingRef.current) return
      isRefreshingRef.current = true
      try {
        await loadRef.current()
      } finally {
        isRefreshingRef.current = false
      }
    }, 300)
  }, [])

  // Add session persistence listeners (register once)
  useEffect(() => {
    const listener = () => debouncedRefresh()
    localFileStore.addListener(listener)
    window.addEventListener('refresh-files', listener)
    return () => {
      localFileStore.removeListener(listener)
      window.removeEventListener('refresh-files', listener)
    }
  }, [])

  // Load files when VFS is ready (debounced once)
  useEffect(() => {
    if (vfs) {
      debouncedRefresh()
    }
  }, [vfs])

  // Build file tree from flat file list
  const buildFileTree = (fileMetas: FileMeta[]): FileNode[] => {
    const nodeMap = new Map<string, FileNode>()
    const rootNodes: FileNode[] = []

    // Create nodes for all files
    for (const fileMeta of fileMetas) {
      const node: FileNode = {
        id: fileMeta.id,
        name: fileMeta.name,
        path: fileMeta.path,
        type: fileMeta.isDirectory ? 'folder' : 'file',
        status: fileMeta.status,
        size: fileMeta.size,
        mtime: fileMeta.mtime,
        children: fileMeta.isDirectory ? [] : undefined,
        expanded: false
      }
      nodeMap.set(fileMeta.path, node)
    }

    // Build hierarchy
    for (const fileMeta of fileMetas) {
      const node = nodeMap.get(fileMeta.path)!
      
      if (fileMeta.parentPath) {
        const parent = nodeMap.get(fileMeta.parentPath)
        if (parent && parent.children) {
          parent.children.push(node)
        }
      } else {
        rootNodes.push(node)
      }
    }

    // Sort nodes
    const sortNodes = (nodes: FileNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      
      for (const node of nodes) {
        if (node.children) {
          sortNodes(node.children)
        }
      }
    }
    
    sortNodes(rootNodes)
    return rootNodes
  }

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

  // Handle drag and drop with VFS
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    
    if (!vfs || !uploader) return
    
    const dataTransfer = e.dataTransfer
    if (!dataTransfer) return

    // Log drag and drop event
    const files = Array.from(dataTransfer.files)
    // Logging removed to fix WebSocket issues

    try {
      setIsUploading(true)
      setWalkProgress({ currentPath: 'Starting...', filesProcessed: 0, totalFiles: 0, currentSize: 0, totalSize: 0 })

      // Start background upload ONLY on user action
      if (!uploader) return

      console.log('🎯 Drag & Drop: Processing dropped items...')
      
      const filesToUpload: File[] = []
      const relativePaths: string[] = []
      const foldersToCreate = new Set<string>()
      
      // Helper function to traverse file tree and preserve folder structure
      const traverseFileTree = async (entry: any, basePath: string = '') => {
        console.log(`🌳 traverseFileTree: entry="${entry.name}", basePath="${basePath}", isFile=${entry.isFile}, isDirectory=${entry.isDirectory}`)
        
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            entry.file(resolve)
          })
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name
          
          console.log(`🌳 File processing: name="${entry.name}", basePath="${basePath}", relativePath="${relativePath}"`)
          console.log(`🌳 File object: name="${file.name}", webkitRelativePath="${file.webkitRelativePath}"`)
          
          filesToUpload.push(file)
          relativePaths.push(relativePath)
          
          console.log(`📄 File: ${relativePath}`)
          
          // Add parent folders to creation set (skip empty paths)
          const pathParts = relativePath.split('/')
          if (pathParts.length > 1) {
            for (let i = 1; i < pathParts.length; i++) {
              const folderPath = pathParts.slice(0, i).join('/')
              if (folderPath && folderPath.trim()) {
                foldersToCreate.add(folderPath)
                console.log(`📁 Added folder to create: ${folderPath}`)
              }
            }
          }
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader()
          const entries = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(resolve)
          })
          
          // Create folder structure
          const folderPath = basePath ? `${basePath}/${entry.name}` : entry.name
          foldersToCreate.add(folderPath)
          
          console.log(`📁 Folder: ${folderPath}`)
          console.log(`📁 Directory entries count: ${entries.length}`)
          
          // Recursively process all entries in the directory
          for (const subEntry of entries) {
            await traverseFileTree(subEntry, folderPath)
          }
        }
      }
      
      // DETAILED WebKit API debugging - NO FALLBACK
      console.log('🔍 DETAILED WebKit API Analysis:')
      console.log('🔍 Browser:', navigator.userAgent)
      console.log('🔍 dataTransfer object:', dataTransfer)
      console.log('🔍 dataTransfer.items:', dataTransfer.items)
      console.log('🔍 dataTransfer.items.length:', dataTransfer.items?.length)
      console.log('🔍 dataTransfer.files:', dataTransfer.files)
      console.log('🔍 dataTransfer.files.length:', dataTransfer.files?.length)
      
      // Check each item in detail
      const items = dataTransfer.items
      console.log('🎯 Processing dropped items:', items.length)
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        console.log(`🎯 Item ${i} DETAILED ANALYSIS:`)
        console.log(`🎯   - kind: ${item.kind}`)
        console.log(`🎯   - type: ${item.type}`)
        console.log(`🎯   - webkitGetAsEntry: ${typeof item.webkitGetAsEntry}`)
        console.log(`🎯   - webkitGetAsEntry function:`, item.webkitGetAsEntry)
        
        if (item.kind === 'file') {
          console.log(`🎯   - Attempting webkitGetAsEntry()...`)
          try {
            const entry = item.webkitGetAsEntry()
            console.log(`🎯   - webkitGetAsEntry() result:`, entry)
            
            if (entry) {
              console.log(`🎯   - Entry name: ${entry.name}`)
              console.log(`🎯   - Entry isFile: ${entry.isFile}`)
              console.log(`🎯   - Entry isDirectory: ${entry.isDirectory}`)
              console.log(`🎯   - Entry fullPath: ${entry.fullPath}`)
              console.log(`🎯   - Entry webkitRelativePath: ${(entry as any).webkitRelativePath}`)
              
              console.log(`🎯   - Processing entry: ${entry.name} (${entry.isFile ? 'file' : 'directory'})`)
              await traverseFileTree(entry, '')
            } else {
              console.log(`🎯   - webkitGetAsEntry() returned null/undefined`)
              console.log(`🎯   - This means WebKit API is NOT working for this item`)
            }
          } catch (error) {
            console.log(`🎯   - webkitGetAsEntry() threw error:`, error)
            console.log(`🎯   - Error details:`, error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : 'No stack trace')
          }
        } else {
          console.log(`🎯   - Item is not a file (kind: ${item.kind})`)
        }
      }
      
      console.log('🎯 FINAL RESULTS:')
      console.log('🎯 filesToUpload count:', filesToUpload.length)
      console.log('🎯 relativePaths:', relativePaths)
      console.log('🎯 foldersToCreate:', Array.from(foldersToCreate))
      
      // If no files were processed, show detailed error
      if (filesToUpload.length === 0) {
        console.log('❌ NO FILES PROCESSED - WebKit API is completely failing!')
        console.log('❌ This means the browser does not support webkitGetAsEntry()')
        console.log('❌ OR the drag-and-drop is not providing proper file entries')
        alert('WebKit API failed to process files. Check console for details.')
        return
      }
      
      // NO FALLBACK - If WebKit API fails, we fail completely
      if (foldersToCreate.size === 0 && filesToUpload.length > 0) {
        console.log('❌ WebKit API processed files but NO FOLDER STRUCTURE detected!')
        console.log('❌ This means webkitGetAsEntry() is not preserving folder hierarchy')
        console.log('❌ All files will be uploaded to root directory')
        alert('WebKit API failed to preserve folder structure. Files will be uploaded to root directory.')
      }

      // Batch create all folders at once (filter out empty folders)
      const validFolders = Array.from(foldersToCreate).filter(f => f && f.trim() && f !== '')
      if (validFolders.length > 0) {
        console.log(`📁 Creating ${validFolders.length} folders in batch...`)
        try {
          const authUser = localStorage.getItem('auth_user')
          const sessionId = authUser ? JSON.parse(authUser).sessionId : null
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (sessionId) headers['x-session-id'] = sessionId
          
          const response = await fetch(`${BACKEND_URL}/folders/batch-create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              folders: validFolders,
              timestamp: Date.now() 
            })
          })
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }
          
          console.log('✅ Folders created successfully')
        } catch (error) {
          console.warn('Failed to batch create folders, continuing with file upload:', error)
        }
      }

      if (filesToUpload.length > 0) {
        await uploadFiles(filesToUpload, relativePaths)
      }

    } catch (error) {
      console.error('Drag and drop error:', error)
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
      setWalkProgress(null)
    }
  }, [vfs, uploader])

  // Background extraction system for large files (from original Explorer)
  const extractInBackground = async (files: File[], relativePaths?: string[]): Promise<{ [path: string]: string }> => {
    const extractedFiles: { [path: string]: string } = {}
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB limit per file
    const MAX_TOTAL_SIZE = 100 * 1024 * 1024 // 100MB total limit
    let totalSize = 0
    let skippedFiles = 0
    
    console.log('🔄 Starting background extraction of', files.length, 'files...')
    console.log('🔄 Sample file paths:', files.slice(0, 5).map((f, i) => ({ 
      name: f.name, 
      webkitRelativePath: f.webkitRelativePath,
      relativePath: relativePaths?.[i]
    })))
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = relativePaths?.[i]
      
      try {
        // Use the provided relativePath to preserve folder structure
        const path = relativePath || file.webkitRelativePath || file.name
        console.log(`🔄 Processing file: "${file.name}" -> path: "${path}"`)
        
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Handle folder picker dialog
  const handleFolderPicker = useCallback(async () => {
    try {
      // Check if File System Access API is supported
      if ('showDirectoryPicker' in window) {
        const directoryHandle = await (window as any).showDirectoryPicker()
        await processDirectoryHandle(directoryHandle)
      } else {
        // Fallback: show file input that accepts directories
        const input = document.createElement('input')
        input.type = 'file'
        input.webkitdirectory = true
        input.multiple = true
        input.onchange = async (e) => {
          const files = Array.from((e.target as HTMLInputElement).files || [])
          if (files.length > 0) {
            await processFilesFromInput(files)
          }
        }
        input.click()
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Folder picker error:', error)
        alert('Failed to open folder picker. Please try drag and drop instead.')
      }
    }
  }, [])

  // Process directory handle from File System Access API
  const processDirectoryHandle = useCallback(async (directoryHandle: any, basePath: string = '') => {
    const filesToUpload: File[] = []
    const relativePaths: string[] = []
    const foldersToCreate = new Set<string>()
    
    // Skip heavy directories that cause performance issues
    const shouldSkipDirectory = (path: string) => {
      const normalizedPath = path.toLowerCase()
      return normalizedPath.includes('node_modules') ||
             normalizedPath.includes('.git') ||
             normalizedPath.includes('dist') ||
             normalizedPath.includes('build') ||
             normalizedPath.includes('.cache') ||
             normalizedPath.includes('__pycache__') ||
             normalizedPath.includes('venv') ||
             normalizedPath.includes('.vscode') ||
             normalizedPath.includes('.idea')
    }
    
    const processEntry = async (handle: any, path: string) => {
      // Skip heavy directories
      if (shouldSkipDirectory(path)) {
        console.log(`⏭️ Skipping heavy directory: ${path}`)
        return
      }
      
      if (handle.kind === 'file') {
        const file = await handle.getFile()
        filesToUpload.push(file)
        relativePaths.push(path)
        console.log(`📄 File: ${path}`)
        
        // Add parent folder to creation set (skip empty paths)
        const pathParts = path.split('/')
        if (pathParts.length > 1) {
          for (let i = 1; i < pathParts.length; i++) {
            const folderPath = pathParts.slice(0, i).join('/')
            if (folderPath && folderPath.trim() && !shouldSkipDirectory(folderPath)) {
              foldersToCreate.add(folderPath)
            }
          }
        }
      } else if (handle.kind === 'directory') {
        console.log(`📁 Folder: ${path}`)
        foldersToCreate.add(path)
        
        // Process all entries in the directory
        for await (const entry of handle.values()) {
          const entryPath = path ? `${path}/${entry.name}` : entry.name
          await processEntry(entry, entryPath)
        }
      }
    }
    
    await processEntry(directoryHandle, basePath)
    
    // Batch create all folders at once
    if (foldersToCreate.size > 0) {
      console.log(`📁 Creating ${foldersToCreate.size} folders in batch...`)
      try {
        const authUser = localStorage.getItem('auth_user')
        const sessionId = authUser ? JSON.parse(authUser).sessionId : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (sessionId) headers['x-session-id'] = sessionId
        
        const response = await fetch(`${BACKEND_URL}/folders/batch-create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            folders: Array.from(foldersToCreate),
            timestamp: Date.now() 
          })
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        console.log('✅ Folders created successfully')
      } catch (error) {
        console.warn('Failed to batch create folders, continuing with file upload:', error)
      }
    }
    
    if (filesToUpload.length > 0) {
      await uploadFiles(filesToUpload, relativePaths)
    }
  }, [])

  // Process files from file input fallback
  const processFilesFromInput = useCallback(async (files: File[]) => {
    const filesToUpload: File[] = []
    const relativePaths: string[] = []
    const folderStructure: { [key: string]: any } = {}
    
    for (const file of files) {
      const path = file.webkitRelativePath || file.name
      filesToUpload.push(file)
      relativePaths.push(path)
      
      // Create folder structure
      const pathParts = path.split('/')
      if (pathParts.length > 1) {
        const folderPath = pathParts.slice(0, -1).join('/')
        if (!folderStructure[folderPath]) {
          folderStructure[folderPath] = {
            name: pathParts[pathParts.length - 2],
            path: folderPath,
            type: 'folder',
            children: []
          }
          
          // Create folder placeholder in database
          try {
            await createFolder(folderPath)
          } catch (error) {
            console.log('Folder already exists or error creating:', error)
          }
        }
      }
      
      console.log(`📄 File: ${path}`)
    }
    
    if (filesToUpload.length > 0) {
      await uploadFiles(filesToUpload, relativePaths)
    }
  }, [])

  // Common upload function for both drag-drop and folder picker
  const uploadFiles = useCallback(async (filesToUpload: File[], relativePaths: string[]) => {
    try {
      setIsUploading(true)
      setWalkProgress({ currentPath: 'Starting...', filesProcessed: 0, totalFiles: 0, currentSize: 0, totalSize: 0 })

      console.log(`📤 Processing ${filesToUpload.length} files with optimized upload...`)
      
      // Logging removed to fix WebSocket issues
      
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
      
      // Extract all files in background (prevents memory issues)
      const extractedFiles = await extractInBackground(filesToUpload, relativePaths)
      
      // Update progress
      const progressElement = document.getElementById('upload-progress')
      if (progressElement) {
        progressElement.textContent = `💾 Saving ${Object.keys(extractedFiles).length} files to database...`
      }
      
      // Save entire workspace in single API call with folder structure
      const authUser = localStorage.getItem('auth_user')
      const parsedAuth = authUser ? JSON.parse(authUser) : null
      const sessionId = parsedAuth ? parsedAuth.sessionId : null
      const terminalToken = parsedAuth ? parsedAuth.terminalToken : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessionId) headers['x-session-id'] = sessionId
      if (terminalToken) headers['x-terminal-token'] = terminalToken
      
      console.log('🔑 Session ID for upload:', sessionId)
      console.log('📁 Extracted files count:', Object.keys(extractedFiles).length)
      console.log('📁 Extracted files paths:', Object.keys(extractedFiles))
      
      // Extract all unique folder paths from the files
      const allFolders = new Set<string>()
      Object.keys(extractedFiles).forEach(filePath => {
        const pathParts = filePath.split('/')
        for (let i = 1; i < pathParts.length; i++) {
          const folderPath = pathParts.slice(0, i).join('/')
          if (folderPath && folderPath.trim()) {
            allFolders.add(folderPath)
          }
        }
      })
      
      console.log('📁 All folders to create:', Array.from(allFolders))
      console.log('📁 Folders count:', allFolders.size)
      
      const uploadPayload = { 
        workspace: extractedFiles,
        folders: Array.from(allFolders),
        timestamp: Date.now() 
      }
      
      console.log('📤 Upload payload:', {
        workspaceFileCount: Object.keys(uploadPayload.workspace).length,
        foldersCount: uploadPayload.folders.length,
        folders: uploadPayload.folders,
        timestamp: uploadPayload.timestamp
      })
      
      const response = await fetch(`${BACKEND_URL}/files/workspace`, {
        method: 'POST',
        headers,
        body: JSON.stringify(uploadPayload)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('✅ Workspace saved successfully:', result)
      
      // Logging removed to fix WebSocket issues
      
      // Remove progress indicator
      const pd = document.querySelector('div[style*="position: fixed"]') as HTMLElement | null
      if (pd && pd.parentNode) pd.parentNode.removeChild(pd)
      
      // Refresh file explorer
      window.dispatchEvent(new Event('refresh-files'))
      
      console.log('✅ Upload completed')
      
    } catch (error) {
      console.error('Upload error:', error)
      
      // Logging removed to fix WebSocket issues
      
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
      setWalkProgress(null)
    }
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Toggle folder expansion
  const toggleFolder = useCallback((node: FileNode) => {
    if (node.type === 'folder') {
      node.expanded = !node.expanded
      setFiles([...files])
    }
  }, [files])

  // Handle file/folder click
  const handleNodeClick = useCallback((node: FileNode) => {
    if (node.type === 'folder') {
      toggleFolder(node)
    } else {
      openFileFromWorkspace(node.path)
    }
    setSelectedPath(node.path)
  }, [toggleFolder])

  // Handle file double-click (open file)
  const handleNodeDoubleClick = useCallback((node: FileNode) => {
    if (node.type === 'file') {
      openFileFromWorkspace(node.path)
    }
  }, [])

  // Open file from workspace
  const openFileFromWorkspace = useCallback(async (path: string) => {
    try {
      // First try to get from VFS for instant access
      if (vfs) {
        const content = await vfs.getFileContent(path)
        if (content) {
          const text = await content.text()
          onOpen(path, text)
          return
        }
      }
      
      // Fallback to API call
      const fileData = await apiOpenFile(path)
      onOpen(path, fileData.content)
      
    } catch (error) {
      console.error(`Could not open ${path}:`, error)
      onOpen(path, '')
    }
  }, [vfs, onOpen])

  // Open folder picker that preserves folder structure
  const openFolderPicker = useCallback(async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.webkitdirectory = true
      input.multiple = true
      input.onchange = async (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || [])
        if (files.length > 0) {
          console.log('📁 Folder picker files:', files.length)
          console.log('📁 Sample file paths:', files.slice(0, 5).map(f => ({ 
            name: f.name, 
            webkitRelativePath: f.webkitRelativePath 
          })))
          
          // Process files with folder structure preservation
          const filesToUpload: File[] = []
          const relativePaths: string[] = []
          const foldersToCreate = new Set<string>()
          
          for (const file of files) {
            const path = file.webkitRelativePath || file.name
            filesToUpload.push(file)
            relativePaths.push(path)
            
            // Extract folder structure from webkitRelativePath
            const pathParts = path.split('/')
            if (pathParts.length > 1) {
              for (let i = 1; i < pathParts.length; i++) {
                const folderPath = pathParts.slice(0, i).join('/')
                if (folderPath && folderPath.trim()) {
                  foldersToCreate.add(folderPath)
                }
              }
            }
          }
          
          console.log('📁 Folders to create:', Array.from(foldersToCreate))
          console.log('📁 Files to upload:', relativePaths)
          
          // Upload files with folder structure
          await uploadFiles(filesToUpload, relativePaths)
        }
      }
      input.click()
    } catch (error) {
      console.error('Error opening folder picker:', error)
    }
  }, [uploadFiles])

  // Refresh workspace
  const refreshWorkspace = useCallback(() => {
    loadWorkspaceFiles()
  }, [loadWorkspaceFiles])

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  // Create new file
  const openPrompt = (title: string, def: string) => new Promise<string | null>((resolve) => {
    setPromptTitle(title)
    setPromptDefault(def)
    promptCallbackRef.current = resolve
    setPromptOpen(true)
  })

  const createNewFile = useCallback(async () => {
    const name = (await openPrompt('New file name (e.g., main.py):', 'untitled.py')) || 'untitled.py'
    if (!name) { setPromptOpen(false); return }

    try {
      // Save to backend database
      await saveFile(name, '')
      
      // Add to VFS
      if (vfs) {
        await vfs.addFileMeta({
          path: name,
          name: name,
          size: 0,
          mtime: Date.now(),
          isDirectory: false,
          status: FILE_STATUS.COMMITTED
        })
        
        // Reload file tree
        await loadWorkspaceFiles()
      }
      
      // Open the new file
      onOpen(name, '')
      
    } catch (error) {
      console.error('Failed to create new file:', error)
      alert('Failed to create new file. Please try again.')
    }
  }, [vfs, loadWorkspaceFiles, onOpen])

  // Create new folder
  const createNewFolder = useCallback(async () => {
    const name = (await openPrompt('New folder name:', 'folder')) || 'folder'
    if (!name) { setPromptOpen(false); return }

    try {
      // Create folder in backend
      await createFolder(name)
      
      // Add to VFS
      if (vfs) {
        await vfs.addFileMeta({
          path: name,
          name: name,
          size: 0,
          mtime: Date.now(),
          isDirectory: true,
          status: FILE_STATUS.COMMITTED
        })
        
        // Reload file tree
        await loadWorkspaceFiles()
      }
      
    } catch (error) {
      console.error('Failed to create folder:', error)
      alert('Failed to create folder. Please try again.')
    }
  }, [vfs, loadWorkspaceFiles])

  // Delete file
  const deleteFileHandler = useCallback(async (filePath: string) => {
    if (!confirm(`Are you sure you want to delete "${filePath}"?`)) return

    try {
      // Delete from backend
      await deleteFile(filePath)
      
      // Remove from VFS
      if (vfs) {
        const fileMeta = await vfs.getFileMeta(filePath)
        if (fileMeta) {
          await db.files.delete(fileMeta.id)
          await loadWorkspaceFiles()
        }
      }
      
    } catch (error) {
      console.error('Failed to delete file:', error)
      alert('Failed to delete file. Please try again.')
    }
  }, [vfs, loadWorkspaceFiles])

  // Delete folder
  const deleteFolderHandler = useCallback(async (folderPath: string) => {
    if (!confirm(`Are you sure you want to delete folder "${folderPath}" and all its contents?`)) return

    try {
      // Delete from backend using the folders/delete endpoint
      const authUser = localStorage.getItem('auth_user')
      const sessionId = authUser ? JSON.parse(authUser).sessionId : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sessionId) headers['X-Session-Id'] = sessionId
      
      const response = await fetch(`${BACKEND_URL}/folders/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ folderPath })
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete folder from backend')
      }
      
      // Remove from VFS
      if (vfs) {
        const projectFiles = await vfs.getProjectFiles()
        const filesToDelete = projectFiles.filter(f => f.path.startsWith(folderPath + '/'))
        
        for (const file of filesToDelete) {
          await db.files.delete(file.id)
        }
        
        await loadWorkspaceFiles()
      }
      
    } catch (error) {
      console.error('Failed to delete folder:', error)
      alert('Failed to delete folder. Please try again.')
    }
  }, [vfs, loadWorkspaceFiles])

  // Rename file/folder
  const renameItem = useCallback(async (oldPath: string, newName: string) => {
    if (!newName || newName === oldPath) return

    try {
      // This would need to be implemented in the backend
      // For now, we'll just update the VFS
      if (vfs) {
        const fileMeta = await vfs.getFileMeta(oldPath)
        if (fileMeta) {
          const newPath = oldPath.includes('/') 
            ? oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName
            : newName
          
          // Update in VFS
          await db.files.update(fileMeta.id, {
            path: newPath,
            name: newName
          })
          
          await loadWorkspaceFiles()
        }
      }
      
    } catch (error) {
      console.error('Failed to rename item:', error)
      alert('Failed to rename item. Please try again.')
    }
  }, [vfs, loadWorkspaceFiles])

  // Restore node_modules
  const restoreDependencies = useCallback(async () => {
    try {
      const result = await restoreNodeModules()
      alert(`✅ Dependencies restored! ${result.restored} files restored.`)
      await loadWorkspaceFiles()
    } catch (error) {
      console.error('Failed to restore dependencies:', error)
      alert('Failed to restore dependencies. Make sure you have uploaded a project with node_modules before.')
    }
  }, [loadWorkspaceFiles])

  // Get status icon
  const getStatusIcon = (status?: FileMeta['status']) => {
    switch (status) {
      case FILE_STATUS.UPLOADED:
      case FILE_STATUS.COMMITTED:
        return <CheckCircle className="w-3 h-3 text-green-500" />
      case FILE_STATUS.UPLOADING:
        return <Clock className="w-3 h-3 text-yellow-500" />
      case FILE_STATUS.ERROR:
        return <AlertCircle className="w-3 h-3 text-red-500" />
      default:
        return <CloudOff className="w-3 h-3 text-gray-500" />
    }
  }

  // Get file emoji based on extension
  const getFileEmoji = (name: string) => {
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

  // Render file tree
  const renderFileTree = (nodes: FileNode[], level = 0) => {
    return nodes.map(node => (
      <div key={node.id}>
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer ${
            selectedPath === node.path ? 'bg-blue-600' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleNodeClick(node)}
          onDoubleClick={() => handleNodeDoubleClick(node)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, node })
          }}
        >
          {node.type === 'folder' && (
            <div className="mr-1">
              {node.expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          )}
          <div className="mr-2">
            {node.type === 'folder' ? (
              <Folder className="w-4 h-4" />
            ) : (
              <span className="text-sm">{getFileEmoji(node.name)}</span>
            )}
          </div>
          <span className="flex-1 truncate">{node.name}</span>
          <div className="flex items-center space-x-1">
            {getStatusIcon(node.status)}
            {node.size && node.size > 0 && (
              <span className="text-xs text-gray-400">
                {(node.size / 1024).toFixed(1)}KB
              </span>
            )}
          </div>
        </div>
        {node.children && node.expanded && (
          <div>
            {renderFileTree(node.children, level + 1)}
          </div>
        )}
      </div>
    ))
  }

  return (
    <div 
      className="h-full flex flex-col bg-gray-800 text-white"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onClick={() => setMenu(null)}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">EXPLORER</h2>
          <div className="flex space-x-1">
            <button
              onClick={refreshWorkspace}
              className="p-1 hover:bg-gray-700 rounded"
              title="Refresh"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenSystem}
              className="p-1 hover:bg-gray-700 rounded"
              title="Open System Files"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            onClick={createNewFile}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            title="New File"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
          <button
            onClick={createNewFolder}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
            Folder
          </button>
          <button
            onClick={handleFolderPicker}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded"
            title="Upload Folder"
          >
            <Upload className="w-3 h-3" />
            Upload Folder
          </button>
          <button
            onClick={restoreDependencies}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            title="Restore Dependencies (node_modules)"
          >
            📦 Restore
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {isUploading && walkProgress && (
        <div className="p-3 bg-blue-900 border-b border-blue-700">
          <div className="text-sm font-medium mb-2">
            📤 Processing {walkProgress.filesProcessed}/{walkProgress.totalFiles} files...
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(walkProgress.filesProcessed / walkProgress.totalFiles) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-300 mt-1">
            {walkProgress.currentPath}
          </div>
        </div>
      )}

      {/* Upload Stats */}
      {uploadStats && (
        <div className="p-3 bg-gray-700 border-b border-gray-600">
          <div className="text-sm font-medium mb-2">Upload Progress</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>Files: {uploadStats.uploadedFiles}/{uploadStats.totalFiles}</div>
            <div>Size: {(uploadStats.uploadedSize / 1024 / 1024).toFixed(1)}MB</div>
          </div>
          {uploadStats.currentBatch && (
            <div className="text-xs text-gray-400 mt-1">
              Current batch: {uploadStats.currentBatch}
            </div>
          )}
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            Loading files...
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <div className="mb-2">
              <Upload className="w-8 h-8 mx-auto mb-2" />
              <p>Drop files or folders here</p>
              <p className="text-xs mt-1">Supports large projects with instant preview</p>
              <button 
                onClick={openFolderPicker}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                📁 Upload Folder (Preserves Structure)
              </button>
            </div>
          </div>
        ) : (
          <div>
            {renderFileTree(filteredFiles)}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {menu && (
        <div
          className="fixed bg-gray-700 border border-gray-600 rounded shadow-lg py-1 z-50 min-w-48"
          style={{ left: menu.x, top: menu.y }}
          onClick={() => setMenu(null)}
        >
          <button 
            className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm flex items-center"
            onClick={() => {
              if (menu.node.type === 'file') {
                openFileFromWorkspace(menu.node.path)
              } else {
                handleNodeClick(menu.node)
              }
              setMenu(null)
            }}
          >
            <FileText className="w-4 h-4 mr-2" />
            {menu.node.type === 'file' ? 'Open' : 'Expand/Collapse'}
          </button>
          
          <div className="border-t border-gray-600 my-1"></div>
          
          <button 
            className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm flex items-center"
            onClick={async () => {
              const newName = await openPrompt(`Rename "${menu.node.name}":`, menu.node.name)
              if (newName && newName !== menu.node.name) {
                await renameItem(menu.node.path, newName)
              }
              setMenu(null)
            }}
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Rename
          </button>
          
          <button 
            className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm flex items-center"
            onClick={() => {
              if (menu.node.type === 'file') {
                deleteFileHandler(menu.node.path)
              } else {
                deleteFolderHandler(menu.node.path)
              }
              setMenu(null)
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
          
          <div className="border-t border-gray-600 my-1"></div>
          
          <button 
            className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm flex items-center"
            onClick={() => {
              createNewFile()
              setMenu(null)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New File
          </button>
          
          <button 
            className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm flex items-center"
            onClick={() => {
              createNewFolder()
              setMenu(null)
            }}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </button>
        </div>
      )}
      {/* Input dialog */}
      <InputDialog
        isOpen={promptOpen}
        prompts={[promptTitle]}
        onSubmit={(values) => {
          setPromptOpen(false)
          promptCallbackRef.current?.(values[0] ?? null)
          promptCallbackRef.current = null
        }}
        onCancel={() => {
          setPromptOpen(false)
          promptCallbackRef.current?.(null)
          promptCallbackRef.current = null
        }}
      />
    </div>
  )
}
