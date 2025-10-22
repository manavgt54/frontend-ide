import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GitHubRepoSelector from './GitHubRepoSelector'

export default function GitHubRepoSelectPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth_user')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.githubToken) setToken(parsed.githubToken)
    } catch {}
  }, [])

  if (!token) {
    // If no token, go back to login
    navigate('/login')
    return null
  }

  return (
    <GitHubRepoSelector
      githubToken={token}
      onRepoSelect={(repo) => navigate('/auth/github/load', { state: { repo } })}
      onBack={() => navigate('/login')}
    />
  )
}
