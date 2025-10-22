import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { InputDialog } from './InputDialog'
import { RotateCcw, Plus, X, MessageSquare } from 'lucide-react'
import { getWsUrl } from '../config/env'

export type TerminalAPI = {
  append: (text: string) => void
  appendError: (text: string) => void
  sendInput: (line: string) => void
  runPythonSmart: (code: string) => Promise<void>
  clear: () => void
  handleRun: (fileName: string, code: string) => Promise<void>
}

type TerminalTab = {
  id: string
  name: string
  terminal: XTerminal
  fit: FitAddon
  sessionId?: string
  userId?: string
  terminalToken?: string
  currentCwd: string
  ws: WebSocket | null
  connected: boolean
  ptyReady: boolean
}

export function Terminal({ onReady }: { onReady?: (append: (text: string) => void, appendError: (text: string) => void, api?: TerminalAPI) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTab, setActiveTab] = useState<string>('')
  const tabsRef = useRef<TerminalTab[]>([])
  const activeTabRef = useRef<string>('')
  const nextId = useRef(1)
  const handleRunFn = useRef<(fileName: string, code: string) => Promise<void>>(async () => {})

  // Simple WebSocket connection
  const connectWebSocket = (tab: TerminalTab) => {
    console.log('🔌 Connecting WebSocket for tab:', tab.id);
    
    // Get session data from localStorage
    const authUser = localStorage.getItem('auth_user');
    if (!authUser) {
      console.error('❌ No auth data found');
      tab.terminal.write('\r\n\x1b[31m[Error: Please log in first]\x1b[0m\r\n');
      return null;
    }
    
    let sessionData;
    try {
      sessionData = JSON.parse(authUser);
    } catch (error) {
      console.error('❌ Error parsing auth data:', error);
      tab.terminal.write('\r\n\x1b[31m[Error: Invalid session data]\x1b[0m\r\n');
      return null;
    }
    
    // Set session data
    tab.sessionId = sessionData.sessionId;
    tab.terminalToken = sessionData.terminalToken;
    tab.userId = sessionData.userId;
    
    if (!tab.sessionId || !tab.terminalToken) {
      console.error('❌ Missing session credentials');
      tab.terminal.write('\r\n\x1b[31m[Error: Missing session credentials]\x1b[0m\r\n');
      return null;
    }
    
    console.log('✅ Session data loaded:', { sessionId: tab.sessionId, hasToken: !!tab.terminalToken });
    
    // Create WebSocket connection
    const wsUrl = getWsUrl();
    console.log('🔌 Connecting to:', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        tab.terminal.write('\r\n\x1b[32m[Connected to backend]\x1b[0m\r\n');
        
        // Store connection
        tab.ws = ws;
        tab.connected = true;
        setTabs(prev => {
          const next = prev.map(t => t.id === tab.id ? { ...t, connected: true, ws } : t)
          tabsRef.current = next
          return next
        })
        
        // Send initialization message
        const initMsg = {
          type: 'init',
          sessionId: tab.sessionId,
          terminalToken: tab.terminalToken,
          userId: tab.userId,
          cols: tab.terminal.cols,
          rows: tab.terminal.rows
        };
        
        console.log('📤 Sending init message:', initMsg);
        ws.send(JSON.stringify(initMsg));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Received:', data.type);
          
          switch (data.type) {
            case 'pty-ready':
              console.log('✅ PTY ready');
              tab.ptyReady = true;
              setTabs(prev => {
                const next = prev.map(t => t.id === tab.id ? { ...t, ptyReady: true } : t)
                tabsRef.current = next
                return next
              })
              tab.terminal.write('\r\n\x1b[32m[Terminal ready]\x1b[0m\r\n');
              break;
              
            case 'output':
              if (data.data) {
                tab.terminal.write(data.data);
              }
              break;
              
            case 'error':
              console.error('Terminal error:', data.message);
              tab.terminal.write(`\r\n\x1b[31m[Error: ${data.message}]\x1b[0m\r\n`);
              break;
              
            case 'session_created':
              console.log('Session created:', data.sessionId);
              tab.sessionId = data.sessionId;
              tab.userId = data.userId;
              tab.currentCwd = data.cwd || '/app/workspace';
              setTabs(prev => {
                const next = prev.map(t => t.id === tab.id ? { 
                  ...t, 
                  sessionId: data.sessionId, 
                  userId: data.userId,
                  currentCwd: data.cwd || '/app/workspace'
                } : t)
                tabsRef.current = next
                return next
              })
              tab.terminal.write(`\r\n\x1b[32m[Session: ${data.sessionId}]\x1b[0m\r\n`);
              break;
          }
        } catch (error) {
          console.error('Message parsing error:', error);
        }
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        tab.terminal.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n');
        
        setTabs(prev => {
          const next = prev.map(t => t.id === tab.id ? { ...t, connected: false, ws: null } : t)
          tabsRef.current = next
          return next
        })
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        tab.terminal.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
        
        setTabs(prev => {
          const next = prev.map(t => t.id === tab.id ? { ...t, connected: false, ws: null } : t)
          tabsRef.current = next
          return next
        })
      };
      
      return ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      tab.terminal.write('\r\n\x1b[31m[Failed to connect]\x1b[0m\r\n');
      return null;
    }
  };

  const createTerminal = () => {
    const id = `terminal-${nextId.current++}`
    const terminal = new XTerminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff'
      },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      scrollback: 5000
    })
    
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    
    const tab: TerminalTab = {
      id,
      name: `Terminal ${nextId.current - 1}`,
      terminal,
      fit,
      currentCwd: '/app/workspace',
      ws: null,
      connected: false,
      ptyReady: false
    }
    
    // Handle terminal input
    terminal.onData((data) => {
      const activeId = activeTabRef.current || activeTab
      const snapshot = tabsRef.current.length ? tabsRef.current : tabs
      const activeTabObj = snapshot.find(t => t.id === activeId);
      if (activeTabObj?.ws && activeTabObj.ws.readyState === WebSocket.OPEN) {
        activeTabObj.ws.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      } else {
        console.warn('No WebSocket connection for input');
      }
    });
    
    setTabs(prev => {
      const next = [...prev, tab]
      tabsRef.current = next
      return next
    })
    setActiveTab(id)
    activeTabRef.current = id
  }

  const closeTab = (id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (tab?.ws) {
      tab.ws.close()
    }
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      tabsRef.current = next
      return next
    })
    if (activeTab === id) {
      const remaining = tabs.filter(t => t.id !== id)
      setActiveTab(remaining.length > 0 ? remaining[0].id : '')
      activeTabRef.current = remaining.length > 0 ? remaining[0].id : ''
    }
  }

  useEffect(() => {
    createTerminal()
  }, [])

  // Mount terminal when active tab changes
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab || !containerRef.current) return

    try {
      tab.terminal.open(containerRef.current)
      tab.fit.fit()
      tab.terminal.writeln('\x1b[32m✓ Terminal ready\x1b[0m')
      tab.terminal.writeln('\x1b[36mType commands to get started\x1b[0m')
      
      // Connect WebSocket
      if (!tab.ws || tab.ws.readyState === WebSocket.CLOSED) {
        console.log('🔌 Connecting WebSocket...');
        const ws = connectWebSocket(tab);
        setTabs(prev => prev.map(t => 
          t.id === tab.id ? { ...t, ws } : t
        ));
      }
      
      tab.terminal.focus()
    } catch (error) {
      console.error('Failed to mount terminal:', error)
    }
  }, [activeTab, tabs])

  // Keep terminal fitted on window resize
  useEffect(() => {
    const handleResize = () => {
      const tab = tabs.find(t => t.id === activeTab)
      if (tab) {
        try { tab.fit.fit() } catch {}
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tabs, activeTab])

  // Expose API to parent
  useEffect(() => {
    if (!onReady) return
    
    const append = (text: string) => {
      const t = tabs.find(tt => tt.id === activeTab)?.terminal
      if (t) t.write(text)
    }
    
    const appendError = (text: string) => {
      const t = tabs.find(tt => tt.id === activeTab)?.terminal
      if (t) t.write(`\r\n\x1b[31m${text}\x1b[0m`)
    }
    
    const api: TerminalAPI = {
      append,
      appendError,
      sendInput: (line: string) => {
        const tab = tabs.find(tt => tt.id === activeTab)
        if (tab?.ws && tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            data: line + '\n'
          }))
        }
      },
      runPythonSmart: async (code: string) => {
        await handleRunFn.current(`unsaved-${Date.now()}.py`, code)
      },
      clear: () => {
        const t = tabs.find(tt => tt.id === activeTab)?.terminal
        if (t) {
          t.clear()
          t.writeln('$ ')
        }
      },
      handleRun: async (fileName: string, code: string) => {
        await handleRunFn.current(fileName, code)
      }
    }
    
    onReady(append, appendError, api)
  }, [tabs, activeTab, onReady])

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Terminal Tabs */}
      <div className="flex bg-[var(--panel)] border-b border-[var(--gutter)]">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-2 border-r border-[var(--gutter)] cursor-pointer ${
              activeTab === tab.id ? 'bg-[var(--bg)]' : 'hover:bg-[var(--gutter)]'
            }`}
            onClick={() => { setActiveTab(tab.id); activeTabRef.current = tab.id }}
          >
            <MessageSquare size={14} />
            <span className="text-sm">{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="hover:bg-[var(--gutter)] rounded p-1"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={createTerminal}
          className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--gutter)]"
        >
          <Plus size={14} />
          <span className="text-sm">New</span>
        </button>
      </div>

      {/* Terminal Container */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
