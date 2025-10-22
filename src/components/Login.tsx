import { useEffect, useState } from 'react'
import { getGoogleClientId, getBackendBaseUrl } from '../config/env'
import { Github, LogIn } from 'lucide-react'

type Props = {
  onSuccess: (user: { email?: string; provider: 'google' | 'github'; name?: string; githubToken?: string }) => void
}

export default function Login({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const googleClientId = getGoogleClientId()

  function handleGitHubClick() {
    setLoading(true)
    setError('')
    
    // GitHub OAuth parameters
    const clientId = 'Ov23liJOQMa53qoe6VaE' // GitHub OAuth app client ID
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/github/callback')
    const scope = encodeURIComponent('user:email repo')
    const state = Math.random().toString(36).substring(7)
    
    // Store state for verification
    sessionStorage.setItem('github_oauth_state', state)
    
    // Redirect to GitHub OAuth
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`
    window.location.href = githubAuthUrl
  }

  function handleGoogleClick() {
    if (!googleClientId) {
      setError('Google Sign-In not configured')
      return
    }
    // Load Google Identity Services script if not loaded
    const ensureScript = () => new Promise<void>((resolve, reject) => {
      if ((window as any).google?.accounts?.oauth2) return resolve()
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load Google script'))
      document.head.appendChild(s)
    })

    setLoading(true)
    setError('')
    ensureScript()
      .then(() => {
        const google = (window as any).google
        const client = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: async (tokenResponse: any) => {
            try {
              if (!tokenResponse || !tokenResponse.access_token) {
                setError('Google sign-in failed')
                return
              }
              // Fetch basic profile (email) without backend, for demo purposes
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
              })
              const profile = await res.json()
              
              // Call backend to create user and session
              const backendUrl = getBackendBaseUrl()
              console.log('🔗 Calling backend URL:', backendUrl)
              const authRes = await fetch(`${backendUrl}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  googleId: profile.sub,
                  email: profile.email
                })
              })
              
              if (!authRes.ok) {
                const errorText = await authRes.text()
                console.error('❌ Backend auth failed:', authRes.status, errorText)
                throw new Error(`Backend auth failed: ${authRes.status} - ${errorText}`)
              }
              
              const authData = await authRes.json()
              console.log('✅ Backend auth success:', authData)
              const user = {
                provider: 'google' as const,
                email: profile?.email,
                name: profile?.name,
                picture: profile?.picture,
                userId: authData.userId,
                sessionId: authData.sessionId,
                terminalToken: authData.terminalToken,
                workspacePath: authData.workspacePath
              }
              localStorage.setItem('auth_user', JSON.stringify(user))
              
              // Also store Google profile for session recovery
              const googleProfile = {
                googleId: profile.sub,
                email: profile.email,
                name: profile.name
              }
              localStorage.setItem('google_profile', JSON.stringify(googleProfile))
              console.log('✅ Stored Google profile for session recovery:', googleProfile)
              
              onSuccess(user)
            } catch (e) {
              setError('Failed to authenticate with backend')
            } finally {
              setLoading(false)
            }
          }
        })
        client.requestAccessToken()
      })
      .catch(() => {
        setLoading(false)
        setError('Failed to load Google Sign-In')
      })
  }

  async function handleEmailContinue() {
    try {
      setLoading(true)
      setError('')
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setError('Enter a valid email')
        return
      }
      const backendUrl = getBackendBaseUrl()
      const authRes = await fetch(`${backendUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (!authRes.ok) {
        const text = await authRes.text()
        throw new Error(text || 'Auth failed')
      }
      const authData = await authRes.json()
      const user = {
        provider: 'google' as const,
        email,
        name: email.split('@')[0],
        userId: authData.userId,
        sessionId: authData.sessionId,
        terminalToken: authData.terminalToken,
        workspacePath: authData.workspacePath
      }
      localStorage.setItem('auth_user', JSON.stringify(user))
      onSuccess(user)
    } catch (e) {
      setError('Failed to authenticate')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const existing = localStorage.getItem('auth_user')
    if (existing) {
      try {
        const user = JSON.parse(existing)
        if (user) onSuccess(user)
      } catch {}
    }
  }, [])

  return (
    <div className="w-full h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-md p-8 rounded-xl border border-[var(--gutter)] bg-[var(--panel)] shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full flex items-center justify-center bg-[var(--gutter)]/40">
            <LogIn size={20} />
          </div>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Sign in to continue to AI IDE</p>
        </div>

        {error && <div className="mb-3 text-red-500 text-sm">{error}</div>}

        <div className="space-y-3">
          <div className="space-y-2">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full py-3 px-4 rounded border border-[var(--gutter)] bg-transparent focus:outline-none"
            />
            <button
              onClick={handleEmailContinue}
              disabled={loading}
              className="w-full py-3 px-4 rounded border border-[var(--gutter)] bg-transparent hover:bg-[var(--gutter)]/20 transition-colors disabled:opacity-50"
            >
              Continue with Email
            </button>
          </div>

          <button
            onClick={handleGitHubClick}
            disabled={loading}
            className="w-full py-3 px-4 rounded border border-[var(--gutter)] bg-transparent hover:bg-[var(--gutter)]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Github size={20} className="text-white" />
            <span className="font-medium">Continue with GitHub</span>
          </button>

          <button
            onClick={handleGoogleClick}
            disabled={loading}
            className="w-full py-3 px-4 rounded border border-[var(--gutter)] bg-transparent hover:bg-[var(--gutter)]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-medium">Continue with Google</span>
          </button>
        </div>

        <div className="mt-5 text-[11px] leading-5 text-[var(--muted)] text-center">
          By continuing, you agree to our Terms and acknowledge our Privacy Policy.
        </div>
      </div>
    </div>
  )
}


