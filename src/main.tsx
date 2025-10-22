import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Login from './components/Login'
import GitHubCallback from './components/GitHubCallback'
import GitHubSuccess from './components/GitHubSuccess'
import GitHubRepoSelectPage from './components/GitHubRepoSelectPage'
import GitHubRepoLoadPage from './components/GitHubRepoLoadPage'
import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom'
// Initialize logging system
// API interceptor removed to fix WebSocket issues

function Root() {
  function handleSuccess() {
    window.location.replace('/')
  }
  return <Login onSuccess={handleSuccess} />
}

const router = createBrowserRouter([
  { path: '/login', element: <Root /> },
  { path: '/auth/github/callback', element: <GitHubCallback /> },
  { path: '/auth/github/success', element: <GitHubSuccess /> },
  { path: '/auth/github/repos', element: <GitHubRepoSelectPage /> },
  { path: '/auth/github/load', element: <GitHubRepoLoadPage /> },
  { path: '/auth/github/error', element: <Root /> },
  { path: '/', element: <App /> },
])
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)

