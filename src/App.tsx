import { useEffect, useRef, useState } from 'react'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { ExplorerVFS } from './components/ExplorerVFS'
import { SearchPanel } from './components/SearchPanel'
import { EditorTabs, Tab } from './components/EditorTabs'
import { Terminal, TerminalAPI } from './components/TerminalOld'
import { getBackendUrl } from './config/env'
import { AIChatPanel } from './components/AIChatPanel'
import Login from './components/Login'
// LogViewer removed to fix WebSocket issues
import GitHubRepoSelector from './components/GitHubRepoSelector'
import GitHubRepoLoader from './components/GitHubRepoLoader'
import { addLocalFiles, ensureSession, logout } from './lib/api'
import { Gutter } from './components/Gutter'
import { runCode, getLanguageFromExtension } from './utils/backendTerminal'

export default function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true)
  const [user, setUser] = useState<any>(null)

  // GitHub authentication state
  const [githubToken, setGithubToken] = useState<string | null>(null)
  const [showRepoSelector, setShowRepoSelector] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<any>(null)
  const [showRepoLoader, setShowRepoLoader] = useState(false)

  const [activePanel, setActivePanel] = useState('explorer')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activePath, setActivePath] = useState<string>('')
  const [appendOut, setAppendOut] = useState<(text: string) => void>(() => () => {})
  const [appendErr, setAppendErr] = useState<(text: string) => void>(() => () => {})
  const [termApi, setTermApi] = useState<TerminalAPI | null>(null)

  // Panel visibility states with localStorage persistence
  const [explorerVisible, setExplorerVisible] = useState<boolean>(() => 
    localStorage.getItem('explorerVisible') !== 'false'
  )
  const [chatVisible, setChatVisible] = useState<boolean>(() => 
    localStorage.getItem('chatVisible') === 'true'
  )
  const [terminalVisible, setTerminalVisible] = useState<boolean>(() => 
    localStorage.getItem('terminalVisible') !== 'false'
  )

  // Panel sizes with localStorage persistence
  const [explorerWidth, setExplorerWidth] = useState<number>(() => 
    parseInt(localStorage.getItem('explorerWidth') || '280')
  )
  const [chatWidth, setChatWidth] = useState<number>(() => 
    parseInt(localStorage.getItem('chatWidth') || '350')
  )
  const [terminalHeight, setTerminalHeight] = useState<number>(() => 
    parseInt(localStorage.getItem('terminalHeight') || String(Math.round(window.innerHeight * 0.3)))
  )

  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 })
  const [isRunning, setIsRunning] = useState(false)

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  // Check authentication status on app load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = await ensureSession()
        if (sessionData) {
          setIsAuthenticated(true)
          setUser(sessionData)
        } else {
          setIsAuthenticated(false)
          setUser(null)
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        setIsAuthenticated(false)
        setUser(null)
      } finally {
        setIsCheckingAuth(false)
      }
    }
    
    checkAuth()
  }, [])

  // Handle GitHub authentication flow
  useEffect(() => {
    const handleGitHubAuth = () => {
      const urlParams = new URLSearchParams(window.location.search)
      const sessionId = urlParams.get('sessionId')
      const terminalToken = urlParams.get('terminalToken')
      const token = urlParams.get('token')
      const error = urlParams.get('error')

      if (error) {
        console.error('GitHub authentication error:', error)
        // Redirect to login with error
        window.location.replace('/login?error=' + encodeURIComponent(error))
        return
      }

      if (sessionId && token) {
        // Store GitHub token for UI flow
        setGithubToken(token)

        // Validate the session with terminalToken if provided and persist auth_user
        const BACKEND_URL = getBackendUrl()
        const persistAndProceed = (data: any) => {
          const sessionData = {
            userId: data.userId,
            sessionId: data.sessionId,
            terminalToken: data.terminalToken || terminalToken || null,
            workspacePath: data.workspacePath || null
          }
          localStorage.setItem('auth_user', JSON.stringify(sessionData))
          setIsAuthenticated(true)
          setUser(sessionData)
          // Show repository selector
          setShowRepoSelector(true)
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        if (terminalToken) {
          fetch(`${BACKEND_URL}/auth/session/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, terminalToken })
          })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json()
                persistAndProceed(data)
              } else {
                // Fallback: store minimal data so user can proceed
                persistAndProceed({ userId: null, sessionId, terminalToken })
              }
            })
            .catch(() => {
              persistAndProceed({ userId: null, sessionId, terminalToken })
            })
        } else {
          // No terminal token in URL; proceed with minimal info
          persistAndProceed({ userId: null, sessionId })
        }
      }
    }

    // Check if we're on GitHub auth success page
    if (window.location.pathname === '/auth/github/success') {
      handleGitHubAuth()
    }
  }, [])

  // Handle GitHub repository selection
  const handleRepoSelect = (repo: any) => {
    setSelectedRepo(repo)
    setShowRepoSelector(false)
    setShowRepoLoader(true)
  }

  // Handle repository loading completion
  const handleRepoLoadComplete = () => {
    setShowRepoLoader(false)
    setSelectedRepo(null)
    setGithubToken(null)
  }

  // Handle back from repository selector
  const handleBackFromRepoSelector = () => {
    setShowRepoSelector(false)
    setGithubToken(null)
    // Redirect to login
    window.location.replace('/login')
  }

  // Handle back from repository loader
  const handleBackFromRepoLoader = () => {
    setShowRepoLoader(false)
    setSelectedRepo(null)
    setShowRepoSelector(true)
  }

  // Handle logout
  const handleLogout = () => {
    logout()
    setIsAuthenticated(false)
    setUser(null)
    setGithubToken(null)
    setShowRepoSelector(false)
    setSelectedRepo(null)
    setShowRepoLoader(false)
  }

  // Do not seed demo files; rely on saved workspace

  useEffect(() => {
    const onCursor = (e: any) => setCursor(e.detail)
    window.addEventListener('ide-cursor' as any, onCursor)
    return () => window.removeEventListener('ide-cursor' as any, onCursor)
  }, [])

  // Persist panel visibility changes
  useEffect(() => {
    localStorage.setItem('explorerVisible', String(explorerVisible))
  }, [explorerVisible])

  useEffect(() => {
    localStorage.setItem('chatVisible', String(chatVisible))
  }, [chatVisible])

  useEffect(() => {
    localStorage.setItem('terminalVisible', String(terminalVisible))
  }, [terminalVisible])

  // Persist panel size changes
  useEffect(() => {
    localStorage.setItem('explorerWidth', String(explorerWidth))
  }, [explorerWidth])

  useEffect(() => {
    localStorage.setItem('chatWidth', String(chatWidth))
  }, [chatWidth])

  useEffect(() => {
    localStorage.setItem('terminalHeight', String(terminalHeight))
  }, [terminalHeight])

  // Function to refresh file explorer
  const refreshFiles = () => {
    // Trigger a custom event that Explorer can listen to
    window.dispatchEvent(new CustomEvent('refresh-files'))
  }

  function onOpen(path: string, content?: string) {
    const existing = tabs.find(t => t.path === path)
    if (existing) { 
      setActivePath(existing.path)
      return 
    }

    let language = 'plaintext'
    if (path.endsWith('.py')) language = 'python'
    else if (path.endsWith('.c')) language = 'c'
    else if (path.endsWith('.cpp') || path.endsWith('.cc') || path.endsWith('.hpp')) language = 'cpp'
    else if (path.endsWith('.js')) language = 'javascript'
    else if (path.endsWith('.ts')) language = 'typescript'
    else if (path.endsWith('.html')) language = 'html'
    else if (path.endsWith('.css')) language = 'css'
    else if (path.endsWith('.json')) language = 'json'
    else if (path.endsWith('.java')) language = 'java'

    const tab: Tab = { path, language, content: content ?? '' }
    setTabs(prev => [...prev, tab])
    setActivePath(path)
  }

  async function openSystemFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.py,.js,.ts,.html,.css,.json,.c,.cpp,.h,.hpp,.java,.txt,.md'
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files) return
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const content = await file.text()
        onOpen(file.name, content)
      }
    }
    input.click()
  }

  async function openSystemDirectory() {
    try {
      const dirHandle = await (window as any).showDirectoryPicker()
      await addLocalFiles(dirHandle)
    } catch (e) {
      console.log('Directory picker cancelled or failed:', e)
    }
  }

  function toggleExplorer() {
    setExplorerVisible(prev => !prev)
  }

  function toggleChat() {
    setChatVisible(prev => !prev)
  }

  // Also support a global event for toggling chat from other components (e.g., Terminal header button)
  useEffect(() => {
    const handler = () => setChatVisible(prev => !prev)
    window.addEventListener('toggle-chat', handler as any)
    return () => window.removeEventListener('toggle-chat', handler as any)
  }, [])

  function toggleTerminal() {
    setTerminalVisible(prev => !prev)
  }

  async function handleRunCode(fileName: string, code: string) {
    setIsRunning(true)
    try {
      // Prefer terminal API to support interactive Python via WebSocket
      if (termApi) {
        await termApi.handleRun(fileName, code)
      } else {
        const language = getLanguageFromExtension(fileName)
        const result = await runCode(language, code)
        if (result.success) {
          if (result.stdout) appendOut(result.stdout)
          if (result.stderr) appendErr(result.stderr)
        } else {
          appendErr(`Error: ${result.error || 'Run failed'}`)
        }
      }
    } catch (error) {
      appendErr(`Error running code: ${error}`)
    } finally {
      setIsRunning(false)
    }
  }

  async function runActiveFromMenu() {
    const active = tabs.find(t => t.path === activePath)
    if (!active) return
    await handleRunCode(active.path, active.content)
  }

  useEffect(() => {
    const handleRunPython = async (e: any) => {
      const { fileName, code } = e.detail
      await handleRunCode(fileName, code)
    }
    window.addEventListener('ide-run-python' as any, handleRunPython)
    return () => window.removeEventListener('ide-run-python' as any, handleRunPython)
  }, [terminalVisible])

  // Resizer constraints
  const explorerMin = 200, explorerMax = Math.round(window.innerWidth * 0.4)
  const chatMin = 300, chatMax = Math.round(window.innerWidth * 0.5)
  const termMin = 180, termMax = Math.round(window.innerHeight * 0.7)

  const onExplorerDrag = (x: number) => {
    const newWidth = Math.max(explorerMin, Math.min(explorerMax, x - 48))
    setExplorerWidth(newWidth)
  }
  const onExplorerEnd = () => localStorage.setItem('explorerWidth', String(explorerWidth))

  const onChatDrag = (x: number) => {
    const newWidth = Math.max(chatMin, Math.min(chatMax, window.innerWidth - x - 48))
    setChatWidth(newWidth)
  }
  const onChatEnd = () => localStorage.setItem('chatWidth', String(chatWidth))

  const onTerminalDrag = (y: number) => {
    const newHeight = Math.max(termMin, Math.min(termMax, window.innerHeight - y - 24))
    setTerminalHeight(newHeight)
  }
  const onTerminalEnd = () => localStorage.setItem('terminalHeight', String(terminalHeight))

  // Show loading screen while checking authentication
  if (isCheckingAuth) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--text)] mx-auto mb-4"></div>
          <p className="text-[var(--text)]">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
        <Login onSuccess={(userData: any) => {
          setIsAuthenticated(true)
          setUser(userData)
        }} />
      </div>
    )
  }

  // Show GitHub repository selector if needed
  if (showRepoSelector && githubToken) {
    return (
      <GitHubRepoSelector
        githubToken={githubToken}
        onRepoSelect={handleRepoSelect}
        onBack={handleBackFromRepoSelector}
      />
    )
  }

  // Show GitHub repository loader if needed
  if (showRepoLoader && selectedRepo && githubToken) {
    return (
      <GitHubRepoLoader
        repo={selectedRepo}
        githubToken={githubToken}
        onComplete={handleRepoLoadComplete}
        onBack={handleBackFromRepoLoader}
      />
    )
  }

  return (
    <div className="app-shell" data-theme={localStorage.getItem('theme') || 'dark'}>
      <Titlebar
        onToggleChat={toggleChat}
        chatVisible={chatVisible}
        onToggleExplorer={toggleExplorer}
        explorerVisible={explorerVisible}
        onRun={runActiveFromMenu}
        onToggleTerminal={toggleTerminal}
        terminalVisible={terminalVisible}
        onLogout={handleLogout}
        user={user}
      />

      <div className="flex-1 flex" style={{ height: 'calc(100vh - 32px - 22px)' }}>
        {/* Left Sidebar */}
        <Sidebar active={activePanel} onSelect={setActivePanel} onLogout={handleLogout} />
        
        {/* Explorer Panel */}
        {explorerVisible && (
          <>
            <div className="left-panel" style={{ width: explorerWidth, minWidth: explorerWidth, maxWidth: explorerWidth }}>
              {activePanel === 'explorer' && <ExplorerVFS onOpen={onOpen} onOpenSystem={openSystemFile} />}
              {activePanel === 'search' && <SearchPanel />}
              {/* LogViewer removed to fix WebSocket issues */}
            </div>
            <Gutter direction="vertical" onDrag={onExplorerDrag} onEnd={onExplorerEnd} className="gutter-v" />
          </>
        )}

        {/* Center Editor Area */}
        <div className="center-editor flex-1 flex flex-col">
          <EditorTabs
            tabs={tabs}
            setTabs={setTabs}
            activePath={activePath}
            setActivePath={setActivePath}
            appendTerminal={(t, isError) => (isError ? appendErr(t) : appendOut(t))}
            onRunCode={handleRunCode}
          />

          {/* Terminal Panel */}
          {terminalVisible && (
            <div className="relative" style={{ height: Math.max(terminalHeight, 180), borderTop: '1px solid var(--gutter)', background: 'var(--panel)' }}>
              <Gutter direction="horizontal" onDrag={onTerminalDrag} onEnd={onTerminalEnd} className="gutter-h absolute left-0 right-0 top-0" />
              <div className="h-full">
                <Terminal onReady={(append, appendError, api) => { setAppendOut(() => append); setAppendErr(() => appendError); setTermApi(api || null) }} />
              </div>
            </div>
          )}
        </div>

        {/* Right Chat Panel */}
        {chatVisible && (
          <>
            <Gutter direction="vertical" onDrag={onChatDrag} onEnd={onChatEnd} className="gutter-v" />
            <div className="right-panel" style={{ width: chatWidth, minWidth: chatWidth, maxWidth: chatWidth }}>
              <AIChatPanel onRefreshFiles={refreshFiles} />
            </div>
          </>
        )}
      </div>

      <div className="statusbar">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <span>Ln {cursor.line}, Col {cursor.col}</span>
            <span>UTF-8</span>
            <span>{activePath.split('.').pop() || 'plaintext'}</span>
            {isRunning && <span className="text-[var(--accent)]">⚙ Running</span>}
          </div>
          <div className="flex items-center gap-4">
            <span>main</span>
            <span>🔔</span>
          </div>
        </div>
      </div>
    </div>
  )
}
