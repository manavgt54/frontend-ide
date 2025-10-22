import { useEffect, useRef, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { X, Plus } from 'lucide-react'
import { saveFile } from '../lib/api'

export type Tab = {
  path: string
  language: string
  content: string
}

export function EditorTabs({
  tabs,
  setTabs,
  activePath,
  setActivePath,
  appendTerminal,
  onRunCode
}: {
  tabs: Tab[]
  setTabs: (tabs: Tab[] | ((prev: Tab[]) => Tab[])) => void
  activePath: string
  setActivePath: (path: string) => void
  appendTerminal: (text: string, isError: boolean) => void
  onRunCode: (fileName: string, code: string) => void
}) {
  const [value, setValue] = useState('')
  const [isUnsaved, setIsUnsaved] = useState(false)
  const tabContentsRef = useRef<Record<string, string>>({})
  const active = tabs.find(t => t.path === activePath)

  // Store content for each tab
  useEffect(() => { 
    if (active) {
      tabContentsRef.current[active.path] = active.content
      setValue(active.content)
      setIsUnsaved(false)
    }
  }, [activePath, active])

  // Update content when active tab changes
  useEffect(() => {
    if (active && tabContentsRef.current[active.path] !== undefined) {
      setValue(tabContentsRef.current[active.path])
      setIsUnsaved(tabContentsRef.current[active.path] !== active.content)
    }
  }, [activePath, active])

  // Mark as unsaved when content changes and auto-save
  useEffect(() => {
    if (active && value !== active.content) {
      setIsUnsaved(true)
      tabContentsRef.current[active.path] = value
      
      // Auto-save after 2 seconds of no changes
      const timeoutId = setTimeout(() => {
        if (active && value !== active.content) {
          saveTab()
        }
      }, 2000)
      
      return () => clearTimeout(timeoutId)
    }
  }, [value, active])

  function closeTab(path: string) {
    const tabIndex = tabs.findIndex(t => t.path === path)
    if (tabIndex === -1) return

    const newTabs = tabs.filter(t => t.path !== path)
    setTabs(newTabs)

    // If closing active tab, switch to another
    if (path === activePath) {
      if (newTabs.length > 0) {
        const newActiveIndex = tabIndex === 0 ? 0 : tabIndex - 1
        setActivePath(newTabs[newActiveIndex].path)
      } else {
        setActivePath('')
      }
    }
  }

  async function createNewTab() {
    const newTab: Tab = {
      path: `untitled-${Date.now()}.txt`,
      language: 'plaintext',
      content: ''
    }
    
    try {
      // Save new file to backend database
      await saveFile(newTab.path, newTab.content)
      
      setTabs((prevTabs: Tab[]) => [...prevTabs, newTab])
      setActivePath(newTab.path)
      
      // Trigger file explorer refresh
      window.dispatchEvent(new Event('refresh-files'))
    } catch (error) {
      console.error('Failed to create new file:', error)
      alert('Failed to create new file. Please try again.')
    }
  }

  async function saveTab() {
    if (!active) return
    
    try {
      // Save to backend database in real-time
      await saveFile(active.path, value)
      
      setTabs((prevTabs: Tab[]) => 
        prevTabs.map(tab => 
          tab.path === active.path 
            ? { ...tab, content: value }
            : tab
        )
      )
      setIsUnsaved(false)
      
      // Trigger file explorer refresh
      window.dispatchEvent(new Event('refresh-files'))
    } catch (error) {
      console.error('Failed to save file:', error)
      alert('Failed to save file. Please try again.')
    }
  }

  async function saveTabAs() {
    if (!active) return
    
    const newPath = prompt('Enter new filename:', active.path)
    if (!newPath) return

    let language = 'plaintext'
    if (newPath.endsWith('.py')) language = 'python'
    else if (newPath.endsWith('.js')) language = 'javascript'
    else if (newPath.endsWith('.ts')) language = 'typescript'
    else if (newPath.endsWith('.html')) language = 'html'
    else if (newPath.endsWith('.css')) language = 'css'
    else if (newPath.endsWith('.json')) language = 'json'
    else if (newPath.endsWith('.c')) language = 'c'
    else if (newPath.endsWith('.cpp')) language = 'cpp'
    else if (newPath.endsWith('.java')) language = 'java'

    try {
      // Save new file to backend database
      await saveFile(newPath, value)
      
      const newTab: Tab = {
        path: newPath,
        language,
        content: value
      }

      setTabs((prevTabs: Tab[]) => [...prevTabs, newTab])
      setActivePath(newPath)
      closeTab(active.path)
      
      // Trigger file explorer refresh
      window.dispatchEvent(new Event('refresh-files'))
    } catch (error) {
      console.error('Failed to save file as:', error)
      alert('Failed to save file. Please try again.')
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault()
            if (e.shiftKey) {
              saveTabAs()
            } else {
              saveTab()
            }
            break
          case 'w':
            e.preventDefault()
            if (active) closeTab(active.path)
            break
          case 'Tab':
            e.preventDefault()
            if (e.shiftKey) {
              // Previous tab
              const currentIndex = tabs.findIndex(t => t.path === activePath)
              if (currentIndex > 0) {
                setActivePath(tabs[currentIndex - 1].path)
              }
            } else {
              // Next tab
              const currentIndex = tabs.findIndex(t => t.path === activePath)
              if (currentIndex < tabs.length - 1) {
                setActivePath(tabs[currentIndex + 1].path)
              }
            }
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activePath, active, value])

  if (!active) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
        <div className="text-center">
          <p className="mb-4">No file open</p>
          <button 
            className="vscode-button primary"
            onClick={createNewTab}
          >
            <Plus size={16} />
            Create New File
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-tabs-container flex-1 flex flex-col">
      <div className="tab-bar">
        {tabs.map(tab => (
          <div
            key={tab.path}
            className={`tab ${tab.path === activePath ? 'tab-active' : ''}`}
            onClick={() => setActivePath(tab.path)}
          >
            <span className="truncate">{tab.path}</span>
            {tabContentsRef.current[tab.path] !== tab.content && (
              <span className="text-xs">●</span>
            )}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.path)
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="tab-new" onClick={createNewTab} title="New File">
          <Plus size={16} />
        </button>
      </div>

      <div className="editor-container flex-1">
        <Editor
          height="100%"
          language={active.language}
          value={value}
          onChange={(value) => setValue(value || '')}
          theme={document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark'}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            suggestOnTriggerCharacters: true,
            parameterHints: { enabled: true },
            hover: { enabled: true }
          }}
        />
      </div>

      <div className="flex items-center justify-between p-2 bg-[var(--panel)] border-t border-[var(--gutter)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {active.language.toUpperCase()}
          </span>
          {isUnsaved && (
            <span className="text-xs text-[var(--warning)]">● Unsaved</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            className="vscode-button"
            onClick={saveTab}
            disabled={!isUnsaved}
          >
            Save
          </button>
          <button
            className="vscode-button primary"
            onClick={() => onRunCode(active.path, value)}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
