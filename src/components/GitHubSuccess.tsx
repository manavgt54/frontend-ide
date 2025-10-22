import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function GitHubSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const handleSuccess = () => {
      try {
        const sessionId = searchParams.get('sessionId')
        const terminalToken = searchParams.get('terminalToken')
        const token = searchParams.get('token')
        
        if (!sessionId || !terminalToken) {
          throw new Error('Missing session data')
        }

        // Store session data
        const user = {
          provider: 'github' as const,
          sessionId: sessionId,
          terminalToken: terminalToken,
          githubToken: token
        }
        localStorage.setItem('auth_user', JSON.stringify(user))
        
        // Clean up OAuth state
        sessionStorage.removeItem('github_oauth_state')
        
        // Redirect to repo selection
        navigate('/auth/github/repos')
      } catch (err) {
        console.error('GitHub OAuth success error:', err)
        navigate('/auth/github/error?error=' + encodeURIComponent(err instanceof Error ? err.message : 'Authentication failed'))
      }
    }

    handleSuccess()
  }, [searchParams, navigate])

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-[var(--muted)]">Completing GitHub authentication...</p>
      </div>
    </div>
  )
}


