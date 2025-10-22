import { FolderOpen, Search, Play, Database, TestTube, LogOut } from 'lucide-react'

const icons = [
  { id: 'explorer', icon: FolderOpen, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'run', icon: Play, label: 'Run & Debug' },
  { id: 'database', icon: Database, label: 'Database' },
  { id: 'testing', icon: TestTube, label: 'Testing' }
]

export function Sidebar({ active, onSelect, onLogout }: { active: string; onSelect: (id: string) => void; onLogout?: () => void }) {
  return (
    <div className="sidebar-icons">
      {icons.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`sidebar-icon ${active === id ? 'active' : ''}`}
          title={label}
        >
          <Icon size={20} />
        </button>
      ))}
      
      {onLogout && (
        <div className="sidebar-divider" />
      )}
      
      {onLogout && (
        <button
          onClick={onLogout}
          className="sidebar-icon logout-button"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      )}
    </div>
  )
}

