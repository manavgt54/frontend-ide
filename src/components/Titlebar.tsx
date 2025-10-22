import { Play, MessageSquare, FolderOpen, Terminal, Sun, Moon, Settings, UserCircle2, LogOut } from 'lucide-react'
import { useState } from 'react'
import { logout } from '../lib/api'

export function Titlebar({
  onToggleChat,
  chatVisible,
  onToggleExplorer, 
  explorerVisible, 
  onRun,
  onToggleTerminal,
  terminalVisible,
  onLogout,
  user
}: {
  onToggleChat: () => void
  chatVisible: boolean
  onToggleExplorer: () => void
  explorerVisible: boolean
  onRun: () => void
  onToggleTerminal: () => void
  terminalVisible: boolean
  onLogout: () => void
  user: any
}) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <button
          className={`titlebar-button ${explorerVisible ? 'active' : ''}`}
          onClick={onToggleExplorer}
          title="Toggle Explorer"
        >
          <FolderOpen size={14} />
          Explorer
        </button>
        
        <div className="titlebar-divider" />
        
        <button
          className={`titlebar-button ${terminalVisible ? 'active' : ''}`}
          onClick={onToggleTerminal}
          title="Toggle Terminal"
        >
          <Terminal size={14} />
          Terminal
        </button>
        
        <div className="titlebar-divider" />
        
        <button
          className={`titlebar-button ${chatVisible ? 'active' : ''}`}
          onClick={onToggleChat}
          title="Toggle AI Chat"
        >
          <MessageSquare size={14} />
          Chat
        </button>
      </div>

      <div className="titlebar-center">
        VS Code-like IDE
      </div>

      <div className="titlebar-right">
        {/* Account menu */}
        <div className="relative">
          <details className="inline-block">
            <summary className="titlebar-button" title={`Account - ${user?.email || 'User'}`} role="button">
              <UserCircle2 size={14} />
              {user?.email && <span className="ml-1 text-xs">{user.email.split('@')[0]}</span>}
            </summary>
            <div className="absolute right-0 mt-1 bg-[var(--panel)] border border-[var(--gutter)] rounded shadow p-1 z-50 min-w-[160px]">
              {user?.email && (
                <div className="px-3 py-2 text-xs text-[var(--text-secondary)] border-b border-[var(--gutter)]">
                  {user.email}
                </div>
              )}
              <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--gutter)]" onClick={onLogout}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          </details>
        </div>

        <button 
          className="titlebar-button primary"
          onClick={onRun}
          title="Run Code"
        >
          <Play size={14} />
          Run
        </button>
        
        <div className="titlebar-divider" />
        
        <button
          className="titlebar-button"
          onClick={toggleTheme}
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        
        <button 
          className="titlebar-button"
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}
