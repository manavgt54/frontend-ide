import { useState } from 'react'
import { Github, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { getBackendUrl } from '../config/env'

interface Repository {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  stargazers_count: number
  watchers_count: number
  language: string | null
  updated_at: string
}

interface Props {
  repo: Repository
  githubToken: string
  onComplete: () => void
  onBack: () => void
}

interface RepoFile {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  download_url?: string
}

export default function GitHubRepoLoader({ repo, githubToken, onComplete, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [filesLoaded, setFilesLoaded] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)

  const fetchRepoContents = async (path: string = ''): Promise<RepoFile[]> => {
    const encoded = path ? `/${encodeURIComponent(path).replace(/%2F/g, '/')}` : ''
    const url = `https://api.github.com/repos/${repo.full_name}/contents${encoded}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch contents: ${response.status}`)
    }

    return response.json()
  }

  const fetchFileContent = async (filePath: string): Promise<string> => {
    const encoded = filePath ? `/${encodeURIComponent(filePath).replace(/%2F/g, '/')}` : ''
    const url = `https://api.github.com/repos/${repo.full_name}/contents${encoded}`
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${githubToken}`,
        // Ask GitHub to return the raw file content to avoid CORS from raw.githubusercontent.com
        'Accept': 'application/vnd.github.v3.raw'
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`)
    }
    return response.text()
  }

  const getAllFiles = async (path: string = ''): Promise<{ [path: string]: string }> => {
    const contents = await fetchRepoContents(path)
    const files: { [path: string]: string } = {}
    let fileCount = 0

    // Count total files first
    const countFiles = async (dirPath: string = ''): Promise<number> => {
      const dirContents = await fetchRepoContents(dirPath)
      let count = 0
      for (const item of dirContents) {
        if (item.type === 'file') {
          count++
        } else if (item.type === 'dir') {
          // Skip certain directories to prevent overload
          if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(item.name)) {
            count += await countFiles(item.path)
          }
        }
      }
      return count
    }

    setStatus('Counting files...')
    const totalCount = await countFiles(path)
    setTotalFiles(totalCount)

    const processDirectory = async (dirPath: string = ''): Promise<void> => {
      const dirContents = await fetchRepoContents(dirPath)
      for (const item of dirContents) {
        if (item.type === 'file') {
          try {
            setStatus(`Loading ${item.path}...`)
            const content = await fetchFileContent(item.path)
            files[item.path] = content
            fileCount++
            setFilesLoaded(fileCount)
            setProgress((fileCount / totalCount) * 100)
          } catch (error) {
            console.error(`Error loading file ${item.path}:`, error)
          }
        } else if (item.type === 'dir') {
          if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(item.name)) {
            await processDirectory(item.path)
          }
        }
      }
    }

    await processDirectory(path)
    return files
  }

  const loadRepository = async () => {
    try {
      setLoading(true)
      setError('')
      setStatus('Starting repository load...')
      setProgress(0)
      setFilesLoaded(0)

      // Get all files from the repository
      const repoFiles = await getAllFiles()
      
      setStatus('Saving to workspace...')
      
      // Save all files to workspace using the optimized upload system
      const backendUrl = getBackendUrl()
      const authUser = localStorage.getItem('auth_user')
      const parsed = authUser ? JSON.parse(authUser) : null
      const sessionId = parsed?.sessionId || ''
      const terminalToken = parsed?.terminalToken || ''

      const response = await fetch(`${backendUrl}/files/workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
          'x-terminal-token': terminalToken,
        },
        body: JSON.stringify({
          workspace: repoFiles,
          timestamp: Date.now()
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to save workspace: ${response.status}`)
      }

      setStatus('Repository loaded successfully!')
      setProgress(100)
      
      window.dispatchEvent(new CustomEvent('terminal-change-dir', { detail: { directory: repo.name } }))
      window.dispatchEvent(new Event('refresh-files'))
      
      setTimeout(() => {
        onComplete()
      }, 1000)

    } catch (err) {
      console.error('Error loading repository:', err)
      setError(err instanceof Error ? err.message : 'Failed to load repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-2xl p-8 rounded-xl border border-[var(--gutter)] bg-[var(--panel)] shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Github size={24} />
          <div>
            <h1 className="text-xl font-semibold">Loading Repository</h1>
            <p className="text-sm text-[var(--muted)]">{repo.full_name}</p>
          </div>
        </div>

        {/* Repository Info */}
        <div className="mb-6 p-4 rounded-lg bg-[var(--gutter)]/20">
          <h3 className="font-medium mb-2">{repo.name}</h3>
          {repo.description && (
            <p className="text-sm text-[var(--muted)] mb-2">{repo.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            {repo.language && <span>Language: {repo.language}</span>}
            <span>Stars: {repo.stargazers_count}</span>
            <span>Updated: {new Date(repo.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Progress */}
        {loading && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{status}</span>
              <span className="text-sm text-[var(--muted)]">
                {filesLoaded} / {totalFiles} files
              </span>
            </div>
            <div className="w-full bg-[var(--gutter)] rounded-full h-2">
              <div 
                className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Success */}
        {!loading && progress === 100 && !error && (
          <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} />
              <span className="text-sm">Repository loaded successfully!</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={loadRepository}
            disabled={loading}
            className="flex-1 py-2 px-4 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              'Load Repository'
            )}
          </button>
          
          <button
            onClick={onBack}
            disabled={loading}
            className="py-2 px-4 rounded-lg border border-[var(--gutter)] hover:bg-[var(--gutter)]/20 transition-colors disabled:opacity-50"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
