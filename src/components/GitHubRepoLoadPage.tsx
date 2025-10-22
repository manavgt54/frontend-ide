import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import GitHubRepoLoader from './GitHubRepoLoader'

export default function GitHubRepoLoadPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: any }
  const repo = location.state?.repo
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth_user')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.githubToken) setToken(parsed.githubToken)
    } catch {}
  }, [])

  if (!repo || !token) {
    navigate('/auth/github/repos')
    return null
  }

  return (
    <GitHubRepoLoader
      repo={repo}
      githubToken={token}
      onComplete={() => navigate('/')}
      onBack={() => navigate('/auth/github/repos')}
    />
  )
}
