import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { InputDialog } from './InputDialog'
import { RotateCcw, Plus, X, MessageSquare, LogOut } from 'lucide-react'
import { getBackendUrl, ENV_CONFIG } from '../config/env'
import { ensureSession, logout } from '../lib/api'

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
  ptyProcess: any
  connected: boolean
  ptyReady: boolean
  commandQueue: string[]
  lastActivity: number
  recovering?: boolean
  recoveredOnce?: boolean
}

export function Terminal({ onReady }: { onReady?: (append: (text: string) => void, appendError: (text: string) => void, api?: TerminalAPI) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTab, setActiveTab] = useState<string>('')
  const inputBuffer = useRef<string>('')
  const nextId = useRef(1)
  const sessionIdRef = useRef<string>('')
  const currentCwdRef = useRef<string>('/app/workspace')
  const mountedIds = useRef<Set<string>>(new Set())
  const handleRunFn = useRef<(fileName: string, code: string) => Promise<void>>(async () => {})
  const [stdinDialogOpen, setStdinDialogOpen] = useState(false)
  const [stdinPrompts, setStdinPrompts] = useState<string[]>([])
  const pendingCodeRef = useRef<string>('')

  // Simplified WebSocket connection for SQLite-based sessions
  const connectWebSocket = async (tab: TerminalTab) => {
    console.log('🔌 Connecting WebSocket for tab:', tab.id);
    
    // Get session data from localStorage (synchronously recover if missing)
    let authUser = localStorage.getItem('auth_user');
    if (!authUser) {
      console.warn('⚠️ No auth data found; attempting to ensure session (blocking)...');
      try {
        const recovered = await ensureSession();
        if (recovered) {
          authUser = localStorage.getItem('auth_user');
          console.log('✅ Session recovered synchronously for WebSocket init');
        }
      } catch {}
      if (!authUser) {
        tab.terminal.write('\r\n\x1b[33m[Restoring session...]\x1b[0m\r\n');
        // Schedule a short retry to avoid user intervention
        setTimeout(() => { void connectWebSocket(tab); }, 1000);
        return null;
      }
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
    sessionIdRef.current = sessionData.sessionId;
    
    if ((!tab.sessionId || !tab.terminalToken) && !tab.recovering && !tab.recoveredOnce) {
      console.warn('⚠️ Missing session credentials; attempting recovery via ensureSession()');
      tab.recovering = true
      tab.terminal.write('\r\n\x1b[33m[Restoring session credentials...]\x1b[0m\r\n');
      
      try {
        const sessionData = await ensureSession()
        if (sessionData) {
          tab.sessionId = sessionData.sessionId;
          tab.terminalToken = sessionData.terminalToken;
          tab.userId = String(sessionData.userId);
          console.log('✅ Session credentials recovered:', { sessionId: tab.sessionId, hasToken: !!tab.terminalToken });
          tab.recoveredOnce = true
          
          // Update sessionIdRef for consistency
          sessionIdRef.current = sessionData.sessionId;
        } else {
          console.error('❌ Failed to recover session credentials');
          tab.terminal.write('\r\n\x1b[31m[Failed to restore session - please log in again]\x1b[0m\r\n');
          return null
        }
      } catch (error) {
        console.error('❌ Error during session recovery:', error);
        tab.terminal.write('\r\n\x1b[31m[Error restoring session - please log in again]\x1b[0m\r\n');
        return null
      } finally {
        tab.recovering = false
      }
    }
    
    console.log('✅ Session data loaded:', { sessionId: tab.sessionId, hasToken: !!tab.terminalToken });
    
    // If we still don't have credentials after recovery, abort
    if (!tab.sessionId || !tab.terminalToken) {
      console.error('❌ Still missing session credentials after recovery attempt');
      tab.terminal.write('\r\n\x1b[31m[Unable to establish terminal connection - missing credentials]\x1b[0m\r\n');
      return null
    }
    
    // Create WebSocket connection to terminal endpoint
    const backendUrl = getBackendUrl();
    const wsUrl = backendUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/terminal'
    console.log('🔌 Connecting to:', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('🎉 WebSocket onopen event fired!');
        console.log('✅ WebSocket connected for terminal session');
        console.log('🔍 WebSocket readyState on open:', ws.readyState);
      tab.terminal.write('\r\n\x1b[32m[Connected to backend]\x1b[0m\r\n')
      
      // Store WebSocket reference in tab object
      tab.ws = ws
      tab.connected = true
      
      // Register this connection in our tracker to prevent duplicates
      if (tab.sessionId) {
        activeConnections.current.set(tab.sessionId, ws);
        console.log('📝 Registered WebSocket connection for session:', tab.sessionId);
      }
      
      // Update connection status
      setTabs(prev => prev.map(t => 
        t.id === tab.id ? { ...t, connected: true, ws } : t
      ))
      
      // Wait a moment for connection to stabilize before sending messages
      setTimeout(() => {
        // Verify connection is still open before proceeding
        if (ws.readyState === WebSocket.OPEN) {
          // Check if we have a previous session to reconnect to
          if (tab.sessionId) {
            console.log('🔄 Attempting to reconnect to existing session:', tab.sessionId);
            console.log('🔍 Tab data for reconnect:', { 
              sessionId: tab.sessionId, 
              terminalToken: tab.terminalToken, 
              userId: tab.userId 
            });
            
            if (!tab.terminalToken) {
              console.error('❌ Missing terminalToken for reconnection! Tab data:', tab);
              console.error('❌ Attempting to get token from localStorage...');
              
              // Try to get token from localStorage as fallback
              const authUser = localStorage.getItem('auth_user');
              if (authUser) {
                try {
                  const parsed = JSON.parse(authUser);
                  if (parsed.terminalToken) {
                    tab.terminalToken = parsed.terminalToken;
                    console.log('✅ Retrieved terminalToken from localStorage:', parsed.terminalToken);
                  }
                } catch (error) {
                  console.error('❌ Error parsing auth_user:', error);
                }
              }
              
              if (!tab.terminalToken) {
                tab.terminal.write('\r\n\x1b[31m[Error: Missing terminal token for reconnection]\x1b[0m\r\n')
                tab.terminal.write('\r\n\x1b[33m[Please refresh the page and log in again]\x1b[0m\r\n')
                return;
              }
            }
            
            tab.terminal.write('\r\n\x1b[33m[Reconnecting to existing session...]\x1b[0m\r\n')
            const reconnectMsg = {
              type: 'reconnect',
              sessionId: tab.sessionId,
              terminalToken: tab.terminalToken, // Required for session verification
              userId: tab.userId, // Send user ID for reconnection
              cols: tab.terminal.cols,
              rows: tab.terminal.rows
            }
            console.log('📤 Sending reconnect message:', reconnectMsg)
            ws.send(JSON.stringify(reconnectMsg))
          } else {
            // Initialize new terminal session
            console.log('🆕 Initializing new terminal session')
            console.log('🔍 Tab data for init:', { 
              sessionId: tab.sessionId, 
              terminalToken: tab.terminalToken, 
              userId: tab.userId 
            });
            
            if (!tab.terminalToken) {
              console.error('❌ Missing terminalToken for initialization! Tab data:', tab);
              tab.terminal.write('\r\n\x1b[31m[Error: Missing terminal token for initialization]\x1b[0m\r\n')
              return;
            }
            
            tab.terminal.write('\r\n\x1b[33m[Initializing new terminal session...]\x1b[0m\r\n')
            const initMsg = {
              type: 'init',
              sessionId: tab.sessionId || `session-${Date.now()}`,
              terminalToken: tab.terminalToken, // Required for session verification
              cols: tab.terminal.cols,
              rows: tab.terminal.rows
            }
            console.log('📤 Terminal: Sending init message:', initMsg)
            console.log('📤 Terminal: Tab sessionId:', tab.sessionId)
            console.log('📤 Terminal: Final sessionId being sent:', initMsg.sessionId)
            ws.send(JSON.stringify(initMsg))
          }
          
          // Start heartbeat after connection
          startHeartbeat()
        }
      }, 100)
    }
    
    // Heartbeat to keep connection healthy
    let heartbeatInterval: any
    const startHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }))
          } catch {}
        }
      }, 15000)
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('📨 WebSocket message received:', data.type, data.data ? data.data.substring(0, 100) + '...' : 'no data')
        
        switch (data.type) {
          case 'connected':
            console.log('WebSocket connection confirmed:', data.message)
            break
          
          // Backend may signal auth/session issues via a standard error type
          case 'error': {
            const message = String(data.message || '').toLowerCase()
            // Auto-recover on session errors without requiring user input
            if (message.includes('session not found') || message.includes('invalid session')) {
              tab.terminal.write('\r\n\x1b[33m[Session invalid - attempting automatic recovery]\x1b[0m\r\n')
              ;(async () => {
                try {
                  const recovered = await ensureSession()
                  if (recovered && tab.ws && tab.ws.readyState === WebSocket.OPEN) {
                    const reconnectMsg = {
                      type: 'reconnect',
                      sessionId: recovered.sessionId,
                      terminalToken: recovered.terminalToken,
                      userId: recovered.userId,
                      cols: tab.terminal.cols,
                      rows: tab.terminal.rows
                    }
                    tab.sessionId = recovered.sessionId
                    tab.terminalToken = recovered.terminalToken
                    tab.userId = String(recovered.userId)
                    tab.ws.send(JSON.stringify(reconnectMsg))
                    tab.terminal.write('\r\n\x1b[32m[Session recovered - reconnecting]\x1b[0m\r\n')
                    return
                  }
                } catch {}
                // If still failing, close and let reconnection flow handle it
                try { tab.ws?.close() } catch {}
              })()
            }
            console.error('Terminal error:', data.message)
            tab.terminal.write(`\r\n\x1b[31m[Error: ${data.message}]\x1b[0m\r\n`)
            break
          }
            
          case 'session_created':
            console.log('New terminal session created:', data.sessionId)
            tab.sessionId = data.sessionId
            tab.userId = data.userId // Store user ID from backend
            tab.currentCwd = data.cwd || '/app/workspace'
            tab.ptyReady = false // PTY not ready yet
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { 
                ...t, 
                sessionId: data.sessionId, 
                userId: data.userId,
                currentCwd: data.cwd || '/app/workspace',
                ptyReady: false
              } : t
            ))
            tab.terminal.write(`\r\n\x1b[32m[Session created: ${data.sessionId}]\x1b[0m\r\n`)
            tab.terminal.write('\r\n\x1b[33m[Waiting for PTY to be ready...]\x1b[0m\r\n')
            
            // Reset reconnection attempts on successful connection
            reconnectionAttempts.current.delete(tab.id)
            const timeoutId = reconnectionTimeouts.current.get(tab.id)
            if (timeoutId) {
              clearTimeout(timeoutId)
              reconnectionTimeouts.current.delete(tab.id)
            }
            break
            
          case 'session_restored':
            console.log('Session restored:', data.sessionId)
            tab.sessionId = data.sessionId
            tab.userId = data.userId // Store user ID from restored session
            tab.currentCwd = data.cwd || '/app/workspace'
            tab.ptyReady = false // Reset PTY ready state after reconnect
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { 
                ...t, 
                sessionId: data.sessionId, 
                userId: data.userId,
                currentCwd: data.cwd || '/app/workspace',
                ptyReady: false
              } : t
            ))
            // Show restoration message
            tab.terminal.write(`\r\n\x1b[32m[Session restored: ${data.message}]\x1b[0m\r\n`)
            tab.terminal.write('\r\n\x1b[33m[Waiting for PTY to be ready after reconnect...]\x1b[0m\r\n')
            
            // Reset reconnection attempts on successful restoration
            reconnectionAttempts.current.delete(tab.id)
            const reconnectionTimeoutId = reconnectionTimeouts.current.get(tab.id)
            if (reconnectionTimeoutId) {
              clearTimeout(reconnectionTimeoutId)
              reconnectionTimeouts.current.delete(tab.id)
            }
            break
            
          case 'output':
            // Handle terminal output from node-pty
            if (data.data) {
              // Clean up the data before writing to terminal
              let cleanData = data.data
              
              // Handle carriage returns and line feeds properly
              cleanData = cleanData.replace(/\r\n/g, '\n')
              cleanData = cleanData.replace(/\r/g, '\n')
              
              // Remove problematic ANSI escape sequences that might cause issues
              cleanData = cleanData.replace(/\x1b\[\?2004[hl]/g, '') // Bracketed paste mode
              
              // Write the cleaned data to terminal
              tab.terminal.write(cleanData)

              // Detect npm install completion to reveal node_modules in explorer
              try {
                const lower = cleanData.toLowerCase()
                const looksLikeNpmInstallDone = (
                  // Common npm install success signals - more comprehensive patterns
                  /added\s+\d+\s+packages/.test(lower) ||
                  /changed\s+\d+\s+packages/.test(lower) ||
                  /audited\s+\d+\s+packages?/.test(lower) ||
                  lower.includes('up to date') ||
                  lower.includes('found 0 vulnerabilities') ||
                  lower.includes('npm notice') ||
                  // Additional patterns for different npm output formats
                  /packages?\s+added/.test(lower) ||
                  /packages?\s+changed/.test(lower) ||
                  /packages?\s+audited/.test(lower) ||
                  lower.includes('packages in') ||
                  lower.includes('package in')
                )

                if (looksLikeNpmInstallDone) {
                  console.log('🎯 npm install completion detected, showing node_modules')
                  try { 
                    localStorage.setItem('show_node_modules', 'true')
                    console.log('✅ localStorage.show_node_modules set to true')
                  } catch (e) {
                    console.error('❌ Failed to set localStorage:', e)
                  }
                  // Trigger explorer refresh to include node_modules
                  window.dispatchEvent(new Event('refresh-files'))
                  console.log('🔄 refresh-files event dispatched')
                }
              } catch (e) {
                console.error('❌ Error in npm install detection:', e)
              }
              
              // Update current working directory if pwd command was executed
              if (data.data.includes('pwd') && data.data.includes('/')) {
                const lines = data.data.split('\n')
                for (const line of lines) {
                  if (line.trim() && line.includes('/') && !line.includes('pwd')) {
                    const newCwd = line.trim()
                    if (newCwd !== tab.currentCwd) {
                      tab.currentCwd = newCwd
                      setTabs(prev => prev.map(t => 
                        t.id === tab.id ? { ...t, currentCwd: newCwd } : t
                      ))
                    }
                    break
                  }
                }
              }
              
              // Track command execution for better UX
              if (data.data.includes('$') || data.data.includes('>')) {
                // Command prompt detected, update activity
                tab.lastActivity = Date.now()
              }
            }
            break
            
          case 'session_exit':
            console.log('Session exited:', data.message)
            tab.terminal.write(`\r\n\x1b[33m[Session ended: ${data.message}]\x1b[0m\r\n`)
            // Clear session ID since it's no longer valid
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { ...t, sessionId: undefined } : t
            ))
            break
            
          
            
          case 'pty-ready':
            console.log('PTY ready for session:', data.sessionId)
            tab.ptyReady = true
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { ...t, ptyReady: true } : t
            ))
            tab.terminal.write(`\r\n\x1b[32m[PTY Ready: ${data.message}]\x1b[0m\r\n`)
            
            // Process any queued commands
            processCommandQueue(tab)
            break
            
          case 'pong':
            // Ping-pong for connection health check
            break
            
          default:
            console.log('Unknown message type:', data.type)
        }
      } catch (error) {
        console.error('WebSocket message error:', error)
      }
    }
    
    ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason)
      
      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      
      // Clean up connection tracker
      if (tab.sessionId && activeConnections.current.get(tab.sessionId) === ws) {
        activeConnections.current.delete(tab.sessionId);
        console.log('🗑️ Removed WebSocket connection from tracker for session:', tab.sessionId);
      }
      
      // Update connection status but keep session ID for reconnection
      setTabs(prev => prev.map(t => 
        t.id === tab.id ? { ...t, connected: false, ws: null } : t
      ))
      
      // Handle different close codes
      if (event.code === 1000 || event.code === 1001) {
        // Normal closure - don't attempt reconnection
        console.log('🔌 Normal WebSocket closure, not attempting reconnection');
        tab.terminal.write('\r\n\x1b[32m[Connection closed normally]\x1b[0m\r\n')
        return;
      } else if (event.code === 1006) {
        // Abnormal closure - likely due to server timeout or network issue
        tab.terminal.write('\r\n\x1b[33m[Connection lost during command - attempting to reconnect...]\x1b[0m\r\n')
        tab.terminal.write('\r\n\x1b[36m[Note: Your command may still be running on the server]\x1b[0m\r\n')
      } else {
        tab.terminal.write('\r\n\x1b[31m[Connection lost - attempting to reconnect...]\x1b[0m\r\n')
      }
      
      // Don't immediately reconnect - let user see the disconnection
      // Use rate-limited reconnection to prevent multiple attempts
      const tabId = tab.id
      const currentAttempts = reconnectionAttempts.current.get(tabId) || 0
      
      const maxAttempts = ENV_CONFIG.WS_MAX_RECONNECT_ATTEMPTS || 5
      const baseInterval = ENV_CONFIG.WS_RECONNECT_INTERVAL || 3000
      if (currentAttempts < maxAttempts) {
        const delay = Math.min(baseInterval * Math.pow(2, currentAttempts), 30000)
        
        console.log(`Scheduling reconnection attempt ${currentAttempts + 1} for tab ${tabId} in ${delay}ms`)
        
        const reconnectionTimeoutId = setTimeout(() => {
          if (tabs.find(t => t.id === tabId)?.connected === false) {
            console.log(`Attempting reconnection ${currentAttempts + 1} for tab ${tabId}`)
            tab.terminal.write(`\r\n\x1b[33m[Attempting to reconnect (${currentAttempts + 1}/5)...]\x1b[0m\r\n`)
            
            // Clear previous timeout
            const prevTimeout = reconnectionTimeouts.current.get(tabId)
            if (prevTimeout) clearTimeout(prevTimeout)
            
            // Attempt reconnection with session recovery
            connectWebSocket(tab).then(newWs => {
              if (newWs) {
                reconnectionAttempts.current.set(tabId, currentAttempts + 1)
                setTabs(prev => prev.map(t => 
                  t.id === tabId ? { ...t, ws: newWs, connected: true } : t
                ))
                console.log('✅ WebSocket reconnected successfully for tab:', tabId)
              } else {
                console.error('❌ WebSocket reconnection failed - no connection established')
              }
            }).catch(error => {
              console.error('❌ Reconnection failed:', error)
            })
          }
        }, delay)
        
        reconnectionTimeouts.current.set(tabId, reconnectionTimeoutId)
      } else {
        console.log(`Max reconnection attempts reached for tab ${tabId}`)
        tab.terminal.write('\r\n\x1b[31m[Max reconnection attempts reached. Please refresh the page.]\x1b[0m\r\n')
      }
    }
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket onerror event fired!');
        console.error('❌ WebSocket error:', error);
        console.error('❌ WebSocket readyState on error:', ws.readyState);
        console.error('❌ WebSocket URL:', wsUrl);
      
      // Clear heartbeat
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
      }
      
      setTabs(prev => prev.map(t => 
        t.id === tab.id ? { ...t, connected: false, ws: null } : t
      ))
      tab.terminal.write('\r\n\x1b[31m[WebSocket connection error]\x1b[0m\r\n')
      
      // Log detailed error information
      if (error instanceof Event) {
        console.error('WebSocket error event:', error.type, error.target)
      }
      
      // Close the connection to trigger reconnection logic
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try { ws.close() } catch {}
      }
      // Trigger reconnection scheduling similar to onclose
      try {
        ws.onclose && ws.onclose({ code: 1006, reason: 'error', wasClean: false } as any)
      } catch {}
    }
    
      return ws;
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      console.error('❌ WebSocket URL:', wsUrl);
      tab.terminal.write('\r\n\x1b[31m[Failed to create WebSocket connection]\x1b[0m\r\n');
      return null;
    }
  }

  const writePrompt = (term?: XTerminal) => {
    const t = term || tabs.find(tt => tt.id === activeTab)?.terminal
    if (!t) return
    const currentTab = tabs.find(tt => tt.id === activeTab)
    const cwd = (currentTab?.currentCwd || '/app/workspace').replace(/\\/g, '/')
    t.write(`$ ${cwd} `)
  }

  useEffect(() => {
    createTerminal()
  }, [])

  // Expose append and API to parent so Run output goes to the ACTIVE terminal
  useEffect(() => {
    if (!onReady) return
    const active = tabs.find(tt => tt.id === activeTab)
    const append = (text: string) => {
      const t = tabs.find(tt => tt.id === activeTab)?.terminal
      if (t) t.write(text)
    }
    const appendError = (text: string) => {
      const t = tabs.find(tt => tt.id === activeTab)?.terminal
      if (t) {
        t.write(`\r\n\x1b[31m${text}\x1b[0m`)
      }
    }
    const api: TerminalAPI = {
      append,
      appendError,
      sendInput: (line: string) => {
        // Send input via WebSocket to node-pty
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
  }, [tabs, activeTab])

  // Retry-open active terminal until container is ready
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTab)
    if (!tab) return
    if (mountedIds.current.has(tab.id)) return

    let attempts = 0
    const tryMount = () => {
      attempts++
      if (containerRef.current && !mountedIds.current.has(tab.id)) {
        try {
          tab.terminal.open(containerRef.current)
          tab.fit.fit()
          tab.terminal.writeln('\x1b[32m✓ Terminal ready - node-pty Backend\x1b[0m')
          tab.terminal.writeln('\x1b[36mType "help" for available commands\x1b[0m')
          if (!sessionIdRef.current) {
            try {
              sessionIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            } catch {
              sessionIdRef.current = `${Date.now()}`
            }
          }
          writePrompt(tab.terminal)
          mountedIds.current.add(tab.id)
          
          // Connect WebSocket for this terminal
          console.log('🔌 Terminal mounted, checking WebSocket connection for tab:', tab.id);
          console.log('🔍 Current WebSocket state:', tab.ws ? tab.ws.readyState : 'null');
          
          if (!tab.ws || tab.ws.readyState === WebSocket.CLOSED) {
            console.log('🔌 Attempting to connect WebSocket...');
            connectWebSocket(tab).then(ws => {
            console.log('🔌 connectWebSocket returned:', ws ? 'WebSocket object' : 'null');
              if (ws) {
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { ...t, ws } : t
            ))
              }
            }).catch(error => {
              console.error('WebSocket connection failed:', error)
            })
          } else {
            console.log('✅ WebSocket already connected or connecting');
          }
          
          // Focus the terminal after mounting
          setTimeout(() => {
            tab.terminal.focus()
          }, 100)
          
          return
        } catch {}
      }
      if (attempts < 20) requestAnimationFrame(tryMount)
    }
    tryMount()
  }, [tabs, activeTab])

  // Remove extra 30s ping loop; rely on backend ping/pong and per-connection heartbeat

  // Listen for working directory changes from drag & drop
  useEffect(() => {
    const handleWorkingDirChange = (event: CustomEvent) => {
      const { directory } = event.detail
      const tab = tabs.find(t => t.id === activeTab)
      
      if (tab && tab.ws && tab.ws.readyState === WebSocket.OPEN) {
        console.log(`🔄 Terminal: Changing working directory to ${directory}`)
        
        // Update local working directory
        tab.currentCwd = directory
        setTabs(prev => prev.map(t => 
          t.id === tab.id ? { ...t, currentCwd: directory } : t
        ))
        
        // Send cd command to backend
        if (tab.ptyReady) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            data: `cd ${directory}\n`
          }))
          tab.terminal.write(`\r\n\x1b[36m[Changed working directory to: ${directory}]\x1b[0m\r\n`)
        } else {
          // Queue the command if PTY is not ready
          tab.commandQueue.push(`cd ${directory}`)
          tab.terminal.write(`\r\n\x1b[33m[Working directory change queued: ${directory}]\x1b[0m\r\n`)
        }
      }
    }
    
    window.addEventListener('terminal-change-dir', handleWorkingDirChange as EventListener)
    
    return () => {
      window.removeEventListener('terminal-change-dir', handleWorkingDirChange as EventListener)
    }
  }, [tabs, activeTab])

  // Enhanced package.json detection
  const detectPackageJson = async (tab: TerminalTab) => {
    if (tab.ws && tab.ws.readyState === WebSocket.OPEN && tab.ptyReady) {
      console.log('🔍 Detecting package.json in current directory...')
      
      // Check if package.json exists in current directory
      tab.ws.send(JSON.stringify({
        type: 'input',
        data: 'ls -la package.json\n'
      }))
      
      // Also check parent directories
      tab.ws.send(JSON.stringify({
        type: 'input',
        data: 'find . -name "package.json" -type f 2>/dev/null | head -5\n'
      }))
    }
  }

  // Auto-detect project type when files are uploaded
  useEffect(() => {
    const handleFileUpload = () => {
      const tab = tabs.find(t => t.id === activeTab)
      if (tab) {
        // Wait a bit for files to be processed, then detect package.json
        setTimeout(() => {
          detectPackageJson(tab)
        }, 2000)
      }
    }
    
    window.addEventListener('refresh-files', handleFileUpload)
    
    return () => {
      window.removeEventListener('refresh-files', handleFileUpload)
    }
  }, [tabs, activeTab])

  // Prevent multiple reconnection attempts
  const reconnectionAttempts = useRef<Map<string, number>>(new Map())
  const reconnectionTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  
  // Track active WebSocket connections per session to prevent duplicates
  const activeConnections = useRef<Map<string, WebSocket>>(new Map())

  // Connection state monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      tabs.forEach(tab => {
        if (tab.ws && tab.connected) {
          // Check if WebSocket is actually open
          if (tab.ws.readyState !== WebSocket.OPEN) {
            console.log(`Connection state mismatch for tab ${tab.id}: connected=${tab.connected}, readyState=${tab.ws.readyState}`)
            setTabs(prev => prev.map(t => 
              t.id === tab.id ? { ...t, connected: false, ws: null } : t
            ))
            tab.terminal.write('\r\n\x1b[33m[Connection state corrected]\x1b[0m\r\n')
          }
        }
      })
    }, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [tabs])

  // Command queuing system
  const queueCommand = (tab: TerminalTab, command: string) => {
    if (!tab.ptyReady) {
      console.log(`⏳ PTY not ready, queuing command: ${command.trim()}`)
      tab.commandQueue.push(command.trim())
      tab.terminal.write(`\r\n\x1b[33m[Command queued: ${command.trim()}] - Waiting for PTY to be ready...\x1b[0m\r\n`)
      return false
    }
    return true
  }

  const processCommandQueue = (tab: TerminalTab) => {
    if (tab.commandQueue.length === 0) return
    
    console.log(`🔄 Processing ${tab.commandQueue.length} queued commands for tab ${tab.id}`)
    tab.terminal.write(`\r\n\x1b[32m[Processing ${tab.commandQueue.length} queued commands...]\x1b[0m\r\n`)
    
    // Process all queued commands in order
    while (tab.commandQueue.length > 0) {
      const queuedCommand = tab.commandQueue.shift()
      if (queuedCommand) {
        console.log(`⚡ Executing queued command: ${queuedCommand}`)
        tab.terminal.write(`\r\n\x1b[36m[Executing queued command: ${queuedCommand}]\x1b[0m\r\n`)
        
        // Send command to backend
        if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            data: queuedCommand + '\n'
          }))
        }
      }
    }
    
    tab.terminal.write(`\r\n\x1b[32m[All queued commands processed]\x1b[0m\r\n`)
  }

  function createTerminal() {
    const id = `terminal-${nextId.current++}`
    const name = `Terminal ${tabs.length + 1}`
    
    // Generate unique session ID for this terminal
    // Use persisted sessionId if available
    const authUser = localStorage.getItem('auth_user')
    const persisted = authUser ? JSON.parse(authUser).sessionId : undefined
    const sessionId = persisted || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const currentCwd = '/app/workspace'

    const term = new XTerminal({
      theme: { background: 'var(--terminal-bg)', foreground: 'var(--terminal-fg)', cursor: 'var(--accent)' },
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      scrollback: 1000,
      rows: 20
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    const newTab: TerminalTab = { 
      id, 
      name, 
      terminal: term, 
      fit, 
      sessionId, 
      userId: undefined, // Will be set when session is created
      currentCwd,
      ws: null,
      ptyProcess: null,
      connected: false,
      ptyReady: false,
      commandQueue: [],
      lastActivity: Date.now(),
      recovering: false,
      recoveredOnce: false
    }
    setTabs(prev => [...prev, newTab])
    setActiveTab(id)

    // Initialize the terminal immediately
    initializeTerminal(newTab)
  }

  function initializeTerminal(tab: TerminalTab) {
    const { terminal } = tab

    const append = (text: string) => {
      terminal.write(text.replace(/\n/g, '\r\n'))
    }

    const appendError = (text: string) => {
      terminal.write(`\x1b[31m${text.replace(/\n/g, '\r\n')}\x1b[0m`)
    }

    const showCommandQueue = (tab: TerminalTab) => {
      if (tab.commandQueue.length > 0) {
        terminal.write(`\r\n\x1b[33m[Command Queue (${tab.commandQueue.length}): ${tab.commandQueue.join(', ')}]\x1b[0m\r\n`)
      }
    }

    // Enhanced command handling for npm/node/git commands
    const handleSmartCommand = (tab: TerminalTab, command: string) => {
      const trimmedCommand = command.trim()
      
      // Handle npm commands with better package.json detection
      if (trimmedCommand.startsWith('npm')) {
        console.log('📦 NPM command detected, checking package.json...')
        
        // First check if package.json exists
        if (tab.ws) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            input: 'ls -la package.json\n',
            sessionId: tab.sessionId
          }))
          
          // Then run the npm command
          setTimeout(() => {
            if (tab.ws) {
              tab.ws.send(JSON.stringify({
                type: 'input',
                input: trimmedCommand + '\n',
                sessionId: tab.sessionId
              }))
            }
          }, 1000)
        }
        
        return true
      }
      
      // Handle node commands
      if (trimmedCommand.startsWith('node')) {
        console.log('🟢 Node command detected')
        if (tab.ws) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            input: trimmedCommand + '\n',
            sessionId: tab.sessionId
          }))
        }
        return true
      }
      
      // Handle git commands
      if (trimmedCommand.startsWith('git')) {
        console.log('🔀 Git command detected')
        if (tab.ws) {
          tab.ws.send(JSON.stringify({
            type: 'input',
            input: trimmedCommand + '\n',
            sessionId: tab.sessionId
          }))
        }
        return true
      }
      
      return false
    }

    const sendInput = async (line: string) => {
      // Handle commands locally
      const trimmedLine = line.trim()
      if (!trimmedLine) {
        terminal.write('$ ')
        return
      }

      // Handle built-in commands
      if (trimmedLine === 'clear' || trimmedLine === 'cls') {
        clear()
        return
      }

      // Handle smart commands (npm, node, git)
      const tab = tabs.find(t => t.id === activeTab)
      if (tab && tab.ws && tab.ws.readyState === WebSocket.OPEN && tab.ptyReady) {
        if (handleSmartCommand(tab, trimmedLine)) {
          terminal.write('$ ')
          return
        }
      }

      if (trimmedLine === 'help') {
        terminal.write('\r\n\x1b[36mAvailable commands:\x1b[0m\r\n')
        terminal.write('  clear/cls - Clear terminal\r\n')
        terminal.write('  help - Show this help\r\n')
        terminal.write('  queue - Show command queue status\r\n')
        terminal.write('  clearqueue - Clear command queue\r\n')
        terminal.write('  status - Show terminal status\r\n')
        terminal.write('  checkpty - Check PTY readiness\r\n')
        terminal.write('  flush - Process queued commands\r\n')
        terminal.write('  cwd - Show current working directory\r\n')
        terminal.write('  session - Show session information\r\n')
        terminal.write('  reconnect - Manually trigger reconnection\r\n')
        terminal.write('  commands - Show all available commands\r\n')
        terminal.write('  version - Show terminal version and backend info\r\n')
        terminal.write('  debug - Show debug information\r\n')
        terminal.write('  info - Show system information\r\n')
        terminal.write('  ping - Test WebSocket connection\r\n')
        terminal.write('  test - Run connection and PTY tests\r\n')
        terminal.write('  help - Show this help\r\n')
        terminal.write('  about - Show terminal about information\r\n')
        terminal.write('  reset - Reset terminal state\r\n')
        terminal.write('  ls - List files\r\n')
        terminal.write('  pwd - Show current directory\r\n')
        terminal.write('  cd <dir> - Change directory\r\n')
        terminal.write('  python <file> - Run Python file\r\n')
        terminal.write('  node <file> - Run Node.js file\r\n')
        terminal.write('  npm <command> - Run npm command\r\n')
        terminal.write('  git <command> - Run git command\r\n')
        terminal.write('  Any other shell command will work normally\r\n')
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'queue') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          if (tab.commandQueue.length === 0) {
            terminal.write('\r\n\x1b[32m[Command queue is empty]\x1b[0m\r\n')
          } else {
            terminal.write(`\r\n\x1b[33m[Command Queue (${tab.commandQueue.length} commands):]\x1b[0m\r\n`)
            tab.commandQueue.forEach((cmd, index) => {
              terminal.write(`  ${index + 1}. ${cmd}\r\n`)
            })
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'clearqueue') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          const queueLength = tab.commandQueue.length
          tab.commandQueue.length = 0
          terminal.write(`\r\n\x1b[32m[Cleared ${queueLength} commands from queue]\x1b[0m\r\n`)
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'status') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Terminal Status:]\x1b[0m\r\n')
          terminal.write(`  Connection: ${tab.connected ? '🟢 Connected' : '🔴 Disconnected'}\r\n`)
          terminal.write(`  PTY Ready: ${tab.ptyReady ? '⚡ Ready' : '⏳ Waiting'}\r\n`)
          terminal.write(`  Session ID: ${tab.sessionId || 'None'}\r\n`)
          terminal.write(`  User ID: ${tab.userId || 'None'}\r\n`)
          terminal.write(`  Current CWD: ${tab.currentCwd}\r\n`)
          terminal.write(`  Queued Commands: ${tab.commandQueue.length}\r\n`)
          if (tab.commandQueue.length > 0) {
            terminal.write('  Queue Contents:\r\n')
            tab.commandQueue.forEach((cmd, index) => {
              terminal.write(`    ${index + 1}. ${cmd}\r\n`)
            })
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'checkpty') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[PTY Status Check:]\x1b[0m\r\n')
          terminal.write(`  PTY Ready: ${tab.ptyReady ? '⚡ Ready' : '⏳ Waiting'}\r\n`)
          terminal.write(`  Connection: ${tab.connected ? '🟢 Connected' : '🔴 Disconnected'}\r\n`)
          terminal.write(`  WebSocket State: ${tab.ws ? tab.ws.readyState : 'No WebSocket'}\r\n`)
          
          if (tab.ptyReady) {
            terminal.write('  ✅ PTY is ready for commands\r\n')
            if (tab.commandQueue.length > 0) {
              terminal.write(`  🔄 Processing ${tab.commandQueue.length} queued commands...\r\n`)
              processCommandQueue(tab)
            }
          } else {
            terminal.write('  ⏳ PTY is not ready yet\r\n')
            if (tab.commandQueue.length > 0) {
              terminal.write(`  📋 ${tab.commandQueue.length} commands are queued\r\n`)
            }
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'flush') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          if (tab.commandQueue.length === 0) {
            terminal.write('\r\n\x1b[32m[Command queue is empty - nothing to flush]\x1b[0m\r\n')
          } else if (!tab.ptyReady) {
            terminal.write('\r\n\x1b[33m[PTY not ready - commands will be processed when PTY becomes ready]\x1b[0m\r\n')
          } else {
            terminal.write(`\r\n\x1b[36m[Flushing ${tab.commandQueue.length} queued commands...]\x1b[0m\r\n`)
            processCommandQueue(tab)
          }
        }
        terminal.write('$ ')
          return
        }

      if (trimmedLine === 'cwd') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write(`\r\n\x1b[36m[Current Working Directory:]\x1b[0m\r\n`)
          terminal.write(`  ${tab.currentCwd}\r\n`)
          
          // Also show the working directory in the terminal header
          const headerElement = document.querySelector('.terminal-header .text-xs:last-of-type')
          if (headerElement) {
            headerElement.textContent = tab.currentCwd.split('/').pop() || 'workspace'
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'session') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Session Information:]\x1b[0m\r\n')
          terminal.write(`  Session ID: ${tab.sessionId || 'None'}\r\n`)
          terminal.write(`  User ID: ${tab.userId || 'None'}\r\n`)
          terminal.write(`  Created: ${tab.lastActivity ? new Date(tab.lastActivity).toLocaleString() : 'Unknown'}\r\n`)
          terminal.write(`  Last Activity: ${tab.lastActivity ? new Date(tab.lastActivity).toLocaleString() : 'Unknown'}\r\n`)
          terminal.write(`  Connection Status: ${tab.connected ? '🟢 Connected' : '🔴 Disconnected'}\r\n`)
          terminal.write(`  PTY Status: ${tab.ptyReady ? '⚡ Ready' : '⏳ Waiting'}\r\n`)
          terminal.write(`  WebSocket State: ${tab.ws ? tab.ws.readyState : 'No WebSocket'}\r\n`)
        }
        terminal.write('$ ')
          return
        }

      if (trimmedLine === 'reconnect') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Manual Reconnection:]\x1b[0m\r\n')
          
          if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
            terminal.write('  ✅ WebSocket is already connected\r\n')
          } else {
            terminal.write('  🔄 Attempting manual reconnection...\r\n')
            
            // Close existing connection if any
            if (tab.ws) {
              tab.ws.close()
            }
            
            // Reset connection state
              setTabs(prev => prev.map(t => 
              t.id === tab.id ? { ...t, connected: false, ws: null, ptyReady: false } : t
            ))
            
            // Attempt new connection
            setTimeout(async () => {
              const ws = await connectWebSocket(tab)
              if (ws) {
                setTabs(prev => prev.map(t => 
                  t.id === tab.id ? { ...t, ws } : t
                ))
                terminal.write('  🔌 New WebSocket connection initiated\r\n')
              }
            }, 1000)
          }
        }
        terminal.write('$ ')
          return
        }

      if (trimmedLine === 'commands') {
        terminal.write('\r\n\x1b[36m[All Available Commands:]\x1b[0m\r\n')
        terminal.write('  \x1b[33mTerminal Control:\x1b[0m\r\n')
        terminal.write('    clear/cls - Clear terminal\r\n')
        terminal.write('    help - Show this help\r\n')
        terminal.write('    commands - Show all available commands\r\n')
        terminal.write('  \x1b[33mPTY & Connection:\x1b[0m\r\n')
        terminal.write('    queue - Show command queue status\r\n')
        terminal.write('    clearqueue - Clear command queue\r\n')
        terminal.write('    status - Show terminal status\r\n')
        terminal.write('    checkpty - Check PTY readiness\r\n')
        terminal.write('    flush - Process queued commands\r\n')
        terminal.write('    reconnect - Manually trigger reconnection\r\n')
        terminal.write('  \x1b[33mSystem Commands:\x1b[0m\r\n')
        terminal.write('    cwd - Show current working directory\r\n')
        terminal.write('    session - Show session information\r\n')
        terminal.write('    ls - List files\r\n')
        terminal.write('    pwd - Show current directory\r\n')
        terminal.write('    cd <dir> - Change directory\r\n')
        terminal.write('    python <file> - Run Python file\r\n')
        terminal.write('    node <file> - Run Node.js file\r\n')
        terminal.write('    npm <command> - Run npm command\r\n')
        terminal.write('    git <command> - Run git command\r\n')
        terminal.write('    Any other shell command will work normally\r\n')
          terminal.write('$ ')
          return
        }

      if (trimmedLine === 'version') {
        terminal.write('\r\n\x1b[36m[Terminal Version & Backend Info:]\x1b[0m\r\n')
        terminal.write('  \x1b[33mFrontend:\x1b[0m\r\n')
        terminal.write('    Terminal: Xterm.js\r\n')
        terminal.write('    Framework: React + TypeScript\r\n')
        terminal.write('    UI: VS Code-style interface\r\n')
        terminal.write('  \x1b[33mBackend:\x1b[0m\r\n')
        terminal.write('    Runtime: Node.js\r\n')
        terminal.write('    Terminal: node-pty\r\n')
        terminal.write('    Communication: WebSocket\r\n')
        terminal.write('    Features: PTY readiness, command queuing, session persistence\r\n')
        terminal.write('  \x1b[33mSession:\x1b[0m\r\n')
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write(`    PTY Ready: ${tab.ptyReady ? '⚡ Yes' : '⏳ No'}\r\n`)
          terminal.write(`    Connection: ${tab.connected ? '🟢 Connected' : '🔴 Disconnected'}\r\n`)
          terminal.write(`    Queued Commands: ${tab.commandQueue.length}\r\n`)
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'debug') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Debug Information:]\x1b[0m\r\n')
          terminal.write('  \x1b[33mTab State:\x1b[0m\r\n')
          terminal.write(`    ID: ${tab.id}\r\n`)
          terminal.write(`    Name: ${tab.name}\r\n`)
          terminal.write(`    Active: ${activeTab === tab.id ? 'Yes' : 'No'}\r\n`)
          terminal.write('  \x1b[33mConnection State:\x1b[0m\r\n')
          terminal.write(`    WebSocket: ${tab.ws ? 'Present' : 'None'}\r\n`)
          terminal.write(`    WebSocket State: ${tab.ws ? tab.ws.readyState : 'N/A'}\r\n`)
          terminal.write(`    Connected: ${tab.connected}\r\n`)
          terminal.write(`    PTY Ready: ${tab.ptyReady}\r\n`)
          terminal.write('  \x1b[33mSession State:\x1b[0m\r\n')
          terminal.write(`    Session ID: ${tab.sessionId || 'None'}\r\n`)
          terminal.write(`    User ID: ${tab.userId || 'None'}\r\n`)
          terminal.write(`    Current CWD: ${tab.currentCwd}\r\n`)
          terminal.write(`    Last Activity: ${new Date(tab.lastActivity).toISOString()}\r\n`)
          terminal.write('  \x1b[33mCommand Queue:\x1b[0m\r\n')
          terminal.write(`    Length: ${tab.commandQueue.length}\r\n`)
          if (tab.commandQueue.length > 0) {
            terminal.write('    Contents:\r\n')
            tab.commandQueue.forEach((cmd, index) => {
              terminal.write(`      ${index + 1}. ${cmd}\r\n`)
            })
          }
          terminal.write('  \x1b[33mReconnection State:\x1b[0m\r\n')
          const attempts = reconnectionAttempts.current.get(tab.id) || 0
          const timeout = reconnectionTimeouts.current.get(tab.id) ? 'Active' : 'None'
          terminal.write(`    Attempts: ${attempts}\r\n`)
          terminal.write(`    Timeout: ${timeout}\r\n`)
        }
          terminal.write('$ ')
          return
        }

      if (trimmedLine === 'info') {
        terminal.write('\r\n\x1b[36m[System Information:]\x1b[0m\r\n')
        terminal.write('  \x1b[33mBrowser:\x1b[0m\r\n')
        terminal.write(`    User Agent: ${navigator.userAgent}\r\n`)
        terminal.write(`    Platform: ${navigator.platform}\r\n`)
        terminal.write(`    Language: ${navigator.language}\r\n`)
        terminal.write(`    Cookie Enabled: ${navigator.cookieEnabled}\r\n`)
        terminal.write('  \x1b[33mScreen:\x1b[0m\r\n')
        terminal.write(`    Width: ${screen.width}x${screen.height}\r\n`)
        terminal.write(`    Available: ${screen.availWidth}x${screen.availHeight}\r\n`)
        terminal.write(`    Color Depth: ${screen.colorDepth}\r\n`)
        terminal.write('  \x1b[33mWindow:\x1b[0m\r\n')
        terminal.write(`    Inner Size: ${window.innerWidth}x${window.innerHeight}\r\n`)
        terminal.write(`    Outer Size: ${window.outerWidth}x${window.outerHeight}\r\n`)
        terminal.write(`    Device Pixel Ratio: ${window.devicePixelRatio}\r\n`)
        terminal.write('  \x1b[33mLocation:\x1b[0m\r\n')
        terminal.write(`    Protocol: ${window.location.protocol}\r\n`)
        terminal.write(`    Host: ${window.location.host}\r\n`)
        terminal.write(`    Path: ${window.location.pathname}\r\n`)
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'ping') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[WebSocket Ping Test:]\x1b[0m\r\n')
          
          if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
            terminal.write('  🔌 Sending ping to backend...\r\n')
            
            try {
              tab.ws.send(JSON.stringify({
                type: 'ping',
                timestamp: Date.now()
              }))
              
              terminal.write('  ✅ Ping sent successfully\r\n')
              terminal.write('  ⏳ Waiting for pong response...\r\n')
              
              // Set up a one-time pong listener
              const pongHandler = (event: MessageEvent) => {
                try {
                  const data = JSON.parse(event.data)
                  if (data.type === 'pong') {
                    const latency = Date.now() - data.timestamp
                    terminal.write(`  ✅ Pong received! Latency: ${latency}ms\r\n`)
                    tab.ws?.removeEventListener('message', pongHandler)
                  }
                } catch (error) {
                  // Ignore parsing errors
                }
              }
              
              tab.ws.addEventListener('message', pongHandler)
              
              // Timeout after 5 seconds
              setTimeout(() => {
                tab.ws?.removeEventListener('message', pongHandler)
                terminal.write('  ⏰ Pong timeout - no response received\r\n')
              }, 5000)
              
            } catch (error) {
              terminal.write(`  ❌ Failed to send ping: ${error}\r\n`)
          }
        } else {
            terminal.write('  ❌ WebSocket not connected\r\n')
            terminal.write('  💡 Use "reconnect" command to establish connection\r\n')
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'test') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Running Connection & PTY Tests:]\x1b[0m\r\n')
          
          // Test 1: WebSocket Connection
          terminal.write('  \x1b[33mTest 1: WebSocket Connection\x1b[0m\r\n')
          if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
            terminal.write('    ✅ WebSocket is connected\r\n')
          } else {
            terminal.write('    ❌ WebSocket is not connected\r\n')
          }
          
          // Test 2: PTY Readiness
          terminal.write('  \x1b[33mTest 2: PTY Readiness\x1b[0m\r\n')
          if (tab.ptyReady) {
            terminal.write('    ✅ PTY is ready for commands\r\n')
          } else {
            terminal.write('    ❌ PTY is not ready yet\r\n')
          }
          
          // Test 3: Session State
          terminal.write('  \x1b[33mTest 3: Session State\x1b[0m\r\n')
          if (tab.sessionId) {
            terminal.write(`    ✅ Session ID: ${tab.sessionId}\r\n`)
          } else {
            terminal.write('    ❌ No session ID\r\n')
          }
          
          if (tab.userId) {
            terminal.write(`    ✅ User ID: ${tab.userId}\r\n`)
          } else {
            terminal.write('    ❌ No user ID\r\n')
          }
          
          // Test 4: Command Queue
          terminal.write('  \x1b[33mTest 4: Command Queue\x1b[0m\r\n')
          if (tab.commandQueue.length === 0) {
            terminal.write('    ✅ Command queue is empty\r\n')
          } else {
            terminal.write(`    ⚠️  ${tab.commandQueue.length} commands queued\r\n`)
          }
          
          // Test 5: Working Directory
          terminal.write('  \x1b[33mTest 5: Working Directory\x1b[0m\r\n')
          if (tab.currentCwd) {
            terminal.write(`    ✅ Current CWD: ${tab.currentCwd}\r\n`)
      } else {
            terminal.write('    ❌ No working directory set\r\n')
          }
          
          // Test 6: Connection Health
          terminal.write('  \x1b[33mTest 6: Connection Health\x1b[0m\r\n')
          const attempts = reconnectionAttempts.current.get(tab.id) || 0
          if (attempts === 0) {
            terminal.write('    ✅ No reconnection attempts\r\n')
          } else {
            terminal.write(`    ⚠️  ${attempts} reconnection attempts\r\n`)
          }
          
          // Summary
          terminal.write('  \x1b[36m[Test Summary:]\x1b[0m\r\n')
          const totalTests = 6
          let passedTests = 0
          if (tab.ws && tab.ws.readyState === WebSocket.OPEN) passedTests++
          if (tab.ptyReady) passedTests++
          if (tab.sessionId) passedTests++
          if (tab.userId) passedTests++
          if (tab.commandQueue.length === 0) passedTests++
          if (tab.currentCwd) passedTests++
          
          terminal.write(`    ${passedTests}/${totalTests} tests passed\r\n`)
          
          if (passedTests === totalTests) {
            terminal.write('    🎉 All tests passed! Terminal is fully operational.\r\n')
          } else {
            terminal.write('    ⚠️  Some tests failed. Check the details above.\r\n')
          }
        }
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'about') {
        terminal.write('\r\n\x1b[36m[Terminal About Information:]\x1b[0m\r\n')
        terminal.write('  \x1b[33mProject:\x1b[0m\r\n')
        terminal.write('    Name: AI IDE Terminal\r\n')
        terminal.write('    Description: Advanced terminal with PTY readiness and command queuing\r\n')
        terminal.write('    Version: 2.0.0\r\n')
        terminal.write('    License: MIT\r\n')
        terminal.write('  \x1b[33mFeatures:\x1b[0m\r\n')
        terminal.write('    ✅ Real PTY processes via node-pty\r\n')
        terminal.write('    ✅ WebSocket-based real-time communication\r\n')
        terminal.write('    ✅ PTY readiness detection and command queuing\r\n')
        terminal.write('    ✅ Session persistence and reconnection handling\r\n')
        terminal.write('    ✅ Working directory tracking\r\n')
        terminal.write('    ✅ Command history and queue management\r\n')
        terminal.write('    ✅ VS Code-style interface\r\n')
        terminal.write('    ✅ Cross-platform support\r\n')
        terminal.write('  \x1b[33mTechnology:\x1b[0m\r\n')
        terminal.write('    Frontend: React + TypeScript + Xterm.js\r\n')
        terminal.write('    Backend: Node.js + node-pty + WebSocket\r\n')
        terminal.write('    Communication: Real-time bidirectional WebSocket\r\n')
        terminal.write('    Terminal: Native PTY processes\r\n')
        terminal.write('  \x1b[33mCommands:\x1b[0m\r\n')
        terminal.write('    Type "help" for basic commands\r\n')
        terminal.write('    Type "commands" for all available commands\r\n')
        terminal.write('    Type "status" for current terminal state\r\n')
        terminal.write('    Type "test" for connection diagnostics\r\n')
        terminal.write('$ ')
        return
      }

      if (trimmedLine === 'reset') {
        const tab = tabs.find(t => t.id === activeTab)
        if (tab) {
          terminal.write('\r\n\x1b[36m[Resetting Terminal State:]\x1b[0m\r\n')
          
          // Clear command queue
          const queueLength = tab.commandQueue.length
          tab.commandQueue.length = 0
          terminal.write(`  ✅ Cleared ${queueLength} queued commands\r\n`)
          
          // Reset reconnection attempts
          reconnectionAttempts.current.delete(tab.id)
          const timeout = reconnectionTimeouts.current.get(tab.id)
          if (timeout) {
            clearTimeout(timeout)
            reconnectionTimeouts.current.delete(tab.id)
          }
          terminal.write('  ✅ Reset reconnection state\r\n')
          
          // Reset PTY ready state
          tab.ptyReady = false
          setTabs(prev => prev.map(t => 
            t.id === tab.id ? { ...t, ptyReady: false } : t
          ))
          terminal.write('  ✅ Reset PTY ready state\r\n')
          
          // Clear terminal
          terminal.clear()
          terminal.write('\x1b[32m✓ Terminal reset complete\x1b[0m\r\n')
          terminal.write('\x1b[36mType "help" for available commands\x1b[0m\r\n')
          terminal.write('$ ')
          return
        }
        terminal.write('$ ')
            return
          }

      // Send command to node-pty backend via WebSocket
      const currentTab = tabs.find(t => t.id === activeTab)
      if (currentTab && currentTab.ws && currentTab.ws.readyState === WebSocket.OPEN) {
        // Check if PTY is ready, if not, queue the command
        if (!currentTab.ptyReady) {
          queueCommand(currentTab, trimmedLine)
          return
        }
        
        // Show command being executed
        terminal.write(`\r\n\x1b[36m[Executing: ${trimmedLine}]\x1b[0m\r\n`)
        
        currentTab.ws.send(JSON.stringify({
          type: 'input',
          input: trimmedLine + '\n',
          sessionId: currentTab.sessionId
        }))
      } else {
        terminal.write('\r\n\x1b[31m[WebSocket not connected]\x1b[0m\r\n')
        terminal.write('\x1b[33m[Attempting to reconnect...]\x1b[0m\r\n')
        
        // Try to reconnect
        if (currentTab) {
          setTimeout(async () => {
            if (!currentTab.ws || currentTab.ws.readyState === WebSocket.CLOSED) {
              const ws = await connectWebSocket(currentTab)
              if (ws) {
              setTabs(prev => prev.map(t => 
                t.id === currentTab.id ? { ...t, ws } : t
              ))
              }
            }
          }, 1000)
        }
        
        writePrompt(terminal)
      }
    }

    // Function to handle project auto-detection and execution
    const handleProjectRun = async (terminal: XTerminal) => {
      terminal.write(`\r\n\x1b[36mAuto-detecting project type and running...\x1b[0m\r\n`)
      terminal.write(`\x1b[33mUse the Run button in the editor for code execution\x1b[0m\r\n`)
            terminal.write('$ ')
          }

    const clear = () => {
      terminal.clear()
      terminal.writeln('\x1b[32m✓ Terminal ready - node-pty Backend\x1b[0m')
      terminal.writeln('\x1b[36mType "help" for available commands\x1b[0m')
      terminal.writeln('$ ')
    }

    const handleRun = async (fileName: string, code: string) => {
      try {
        const language = getLanguageFromExtension(fileName)
        terminal.write(`\r\n\x1b[36m$ Running ${fileName} (${language})\x1b[0m\r\n`)
        
        // For now, just show a message - actual execution would be via WebSocket
        terminal.write(`\x1b[33mCode execution via node-pty backend\x1b[0m\r\n`)
        terminal.write('$ ')
      } catch (error) {
        terminal.write(`\x1b[31m✗ Error: ${error}\x1b[0m\r\n$ `)
      }
    }

    // Helper function to get language from extension
    const getLanguageFromExtension = (filename: string): string => {
      const extension = filename.toLowerCase().split('.').pop()
      const languageMap: { [key: string]: string } = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'c': 'c',
        'cpp': 'cpp',
        'java': 'java',
        'rs': 'rust',
        'go': 'go'
      }
      return languageMap[extension || ''] || 'plaintext'
    }

    // Handle terminal input
    terminal.onData((data) => {
      console.log('Terminal received data:', data, 'charCode:', data.charCodeAt(0))
      
              // Normal terminal mode - send to node-pty
        if (data === '\r') {
          const toSend = inputBuffer.current
          inputBuffer.current = ''
          terminal.write('\r\n')
          
          // Send command to backend via WebSocket
          if (tab.ws && tab.ws.readyState === WebSocket.OPEN && tab.ptyReady) {
            const commandMsg = {
              type: 'input',
              input: toSend + '\n',
              sessionId: tab.sessionId
            }
            console.log('📤 Terminal: Sending command message:', commandMsg)
            console.log('📤 Terminal: Tab sessionId:', tab.sessionId)
            tab.ws.send(JSON.stringify(commandMsg))
            console.log('📤 Sent command to backend:', toSend)
          } else if (tab.ws && tab.ws.readyState === WebSocket.OPEN && !tab.ptyReady) {
            // PTY not ready, queue the command
            if (tab.commandQueue) {
              tab.commandQueue.push(toSend)
              tab.terminal.write(`\r\n\x1b[33m[Command queued (PTY not ready): ${toSend}]\x1b[0m\r\n`)
              console.log('📋 Command queued:', toSend)
            }
          } else {
            // No WebSocket connection
            tab.terminal.write(`\r\n\x1b[31m[No connection to backend - command not sent: ${toSend}]\x1b[0m\r\n`)
            console.log('❌ No WebSocket connection for command:', toSend)
          }
          
          terminal.write('$ ')
      } else if (data === '\u0008' || data === '\x7f') {
        // Backspace
        if (inputBuffer.current.length > 0) {
          inputBuffer.current = inputBuffer.current.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (data >= ' ') {
        // Printable characters: buffer and display immediately
        inputBuffer.current += data
        terminal.write(data) // Show typed characters immediately
      }
    })

    // Keyboard shortcuts: Ctrl+C (SIGINT) and Ctrl+V (paste)
    // - If there is a selection, allow browser copy (Ctrl+C)
    // - If no selection, send SIGINT (\x03) to PTY
    terminal.attachCustomKeyEventHandler((ev) => {
      try {
        const key = (ev.key || '').toLowerCase()
        const isCtrl = ev.ctrlKey || ev.metaKey

        // Ctrl+C handling
        if (isCtrl && key === 'c') {
          const hasSelection = typeof terminal.hasSelection === 'function' ? terminal.hasSelection() : false
          if (!hasSelection) {
            const currentTab = tabs.find(t => t.id === activeTab)
            if (currentTab && currentTab.ws && currentTab.ws.readyState === WebSocket.OPEN) {
              // Send ETX (SIGINT)
              currentTab.ws.send(JSON.stringify({
                type: 'input',
                input: '\u0003',
                sessionId: currentTab.sessionId
              }))
            }
            // Prevent default copy when we intend SIGINT
            ev.preventDefault()
            return false
          }
          // If there is a selection, let normal copy proceed
          return true
        }

        // Ctrl+V handling: allow paste; xterm will deliver pasted text via onData
        if (isCtrl && key === 'v') {
          return true
        }
      } catch {}
      return true
    })

    // Handle terminal resize
    terminal.onResize(({ cols, rows }) => {
      if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
        tab.ws.send(JSON.stringify({
          type: 'resize',
          cols,
          rows
        }))
      }
    })

    // Ensure terminal has focus and is ready for input
    terminal.focus()

    const api: TerminalAPI = { append, appendError, sendInput, runPythonSmart: async () => {}, clear, handleRun }
    // Keep a reference so onReady-based API can call run regardless of React closure timing
    handleRunFn.current = handleRun
    onReady?.(append, appendError, api)
  }

  function closeTab(id: string) {
    const tab = tabs.find(t => t.id === id)
    if (tab) {
      // Close WebSocket connection
      if (tab.ws) {
        tab.ws.close()
      }
      tab.terminal.dispose()
    }
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (activeTab === id && newTabs.length > 0) setActiveTab(newTabs[0].id)
  }

  function clearActiveTerminal() {
    const tab = tabs.find(t => t.id === activeTab)
    if (tab) {
      tab.terminal.clear()
      tab.terminal.writeln('\x1b[32m✓ Terminal ready - node-pty Backend\x1b[0m')
      tab.terminal.writeln('\x1b[36mType "help" for available commands\x1b[0m')
      tab.terminal.writeln('$ ')
    }
  }

  useEffect(() => {
    const onResize = () => {
      const tab = tabs.find(t => t.id === activeTab)
      if (tab) tab.fit.fit()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [tabs, activeTab])

  return (
    <div className="h-full flex flex-col">
      <div className="terminal-header">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">TERMINAL</span>
          {tabs.find(t => t.id === activeTab)?.connected && (
            <span className="text-xs text-green-500" title="Connected">●</span>
          )}
          {!tabs.find(t => t.id === activeTab)?.connected && (
            <span className="text-xs text-red-500" title="Disconnected">●</span>
          )}
          {tabs.find(t => t.id === activeTab)?.ptyReady && (
            <span className="text-xs text-blue-500" title="PTY Ready">⚡</span>
          )}
          {tabs.find(t => t.id === activeTab)?.connected && !tabs.find(t => t.id === activeTab)?.ptyReady && (
            <span className="text-xs text-yellow-500" title="Waiting for PTY">⏳</span>
          )}
          <span className="text-xs text-[var(--muted)]">
            {tabs.find(t => t.id === activeTab)?.currentCwd?.split('/').pop() || 'workspace'}
          </span>
          <div className="flex items-center gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1 text-xs transition-fast ${activeTab === tab.id ? 'bg-[var(--bg)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {tab.name}
                <X size={12} className="ml-2 hover:text-[var(--error)] transition-fast" onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }} />
              </button>
            ))}
            <button onClick={createTerminal} className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-fast" title="New Terminal">
              <Plus size={14} />
            </button>
            <button
              onClick={() => window.dispatchEvent(new Event('toggle-chat'))}
              className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-fast"
              title="Toggle Chat"
            >
              <MessageSquare size={14} />
            </button>
            <button
              onClick={logout}
              className="p-1 text-[var(--error)] hover:text-[var(--text)] hover:bg-[var(--error)] transition-fast"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
        <button onClick={clearActiveTerminal} className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-fast" title="Clear Terminal">
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="terminal-content flex-1">
        {tabs.map(tab => (
          <div key={tab.id} className={`h-full w-full ${activeTab === tab.id ? 'block' : 'hidden'}`} ref={activeTab === tab.id ? containerRef : null} />
        ))}
      </div>
    </div>
  )
}
