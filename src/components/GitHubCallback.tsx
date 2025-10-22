import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBackendBaseUrl } from '../config/env'

export default function GitHubCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        
        if (!code) {
          throw new Error('No authorization code received')
        }

        // Verify state parameter
        const storedState = sessionStorage.getItem('github_oauth_state')
        if (state !== storedState) {
          throw new Error('Invalid state parameter')
        }

        // The backend redirects to /auth/github/success, so we should redirect there
        // instead of trying to fetch from the backend callback endpoint
        const backendUrl = getBackendBaseUrl()
        window.location.href = `${backendUrl}/auth/github/callback?code=${code}&state=${state}`
      } catch (err) {
        console.error('GitHub OAuth callback error:', err)
        setError(err instanceof Error ? err.message : 'Authentication failed')
        navigate('/auth/github/error?error=' + encodeURIComponent(err instanceof Error ? err.message : 'Authentication failed'))
      } finally {
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-[var(--muted)]">Completing GitHub authentication...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="text-red-500 mb-4">❌ Authentication Error</div>
          <p className="text-[var(--muted)]">{error}</p>
          <button 
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-[var(--gutter)] rounded hover:bg-[var(--gutter)]/80"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return null
}
