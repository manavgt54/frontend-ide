import { useState, useEffect } from 'react'
import { Github, Folder, Star, Eye, ArrowLeft, Loader2 } from 'lucide-react'

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
  githubToken: string
  onRepoSelect: (repo: Repository) => void
  onBack: () => void
}

export default function GitHubRepoSelector({ githubToken, onRepoSelect, onBack }: Props) {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchRepositories()
  }, [githubToken])

  const fetchRepositories = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      setRepos(data)
    } catch (err) {
      console.error('Error fetching repositories:', err)
      setError('Failed to fetch repositories. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[var(--accent)]" />
          <p className="text-[var(--muted)]">Loading your repositories...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-4xl p-8 rounded-xl border border-[var(--gutter)] bg-[var(--panel)] shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-[var(--gutter)]/20 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Github size={24} />
            <h1 className="text-2xl font-semibold">Select Repository</h1>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-[var(--gutter)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Repository List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredRepos.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              {searchQuery ? 'No repositories found matching your search.' : 'No repositories found.'}
            </div>
          ) : (
            filteredRepos.map((repo) => (
              <div
                key={repo.id}
                onClick={() => onRepoSelect(repo)}
                className="p-4 rounded-lg border border-[var(--gutter)] hover:bg-[var(--gutter)]/10 cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Folder size={16} className="text-[var(--muted)]" />
                      <h3 className="font-medium text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                        {repo.name}
                      </h3>
                      {repo.private && (
                        <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-600 rounded">
                          Private
                        </span>
                      )}
                    </div>
                    
                    {repo.description && (
                      <p className="text-sm text-[var(--muted)] mb-2 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                      {repo.language && (
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                          {repo.language}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Star size={12} />
                        {repo.stargazers_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {repo.watchers_count}
                      </span>
                      <span>Updated {formatDate(repo.updated_at)}</span>
                    </div>
                  </div>
                  
                  <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-2 h-2 rounded-full bg-[var(--accent)]"></div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 text-center text-xs text-[var(--muted)]">
          Click on a repository to load it into your workspace
        </div>
      </div>
    </div>
  )
}
