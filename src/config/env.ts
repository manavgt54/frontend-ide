/// <reference types="vite/client" />
// Frontend Environment Configuration
const isElectron = typeof window !== 'undefined' && (
  (navigator && navigator.userAgent && navigator.userAgent.includes('Electron')) ||
  // @ts-ignore
  (window.process && window.process.versions && window.process.versions.electron)
)

export const ENV_CONFIG = {
  // Backend URLs
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || 'https://ai-ide-5.onrender.com',
  WS_URL: import.meta.env.VITE_WS_URL || 'wss://ai-ide-5.onrender.com',
  
  // API Endpoints
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'https://ai-ide-5.onrender.com',
  GEMINI_API_URL: import.meta.env.VITE_GEMINI_API_URL || 'https://ai-ide-5.onrender.com',
  
  // App Configuration
  APP_NAME: import.meta.env.VITE_APP_NAME || 'AI IDE',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  APP_ENV: import.meta.env.VITE_APP_ENV || 'production',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '1083313446645-u35omicoumuavcnnn8u2duun9stipbeq.apps.googleusercontent.com',
  
  // Terminal Configuration
  TERMINAL_ROWS: parseInt(import.meta.env.VITE_TERMINAL_ROWS || '20'),
  TERMINAL_COLS: parseInt(import.meta.env.VITE_TERMINAL_COLS || '80'),
  TERMINAL_FONT_SIZE: parseInt(import.meta.env.VITE_TERMINAL_FONT_SIZE || '14'),
  
  // WebSocket Configuration
  WS_RECONNECT_INTERVAL: parseInt(import.meta.env.VITE_WS_RECONNECT_INTERVAL || '3000'),
  WS_MAX_RECONNECT_ATTEMPTS: parseInt(import.meta.env.VITE_WS_MAX_RECONNECT_ATTEMPTS || '5'),
  
  // Development mode
  IS_DEV: import.meta.env.DEV || false,
  IS_PROD: import.meta.env.PROD || true,
} as const;

// Helper functions
export const getBackendUrl = () => ENV_CONFIG.BACKEND_URL;
export const getWsUrl = () => ENV_CONFIG.WS_URL;
export const getApiBaseUrl = () => ENV_CONFIG.API_BASE_URL;
export const getBackendBaseUrl = () => {
  // For OAuth endpoints, we need the base URL without /api suffix
  const apiUrl = ENV_CONFIG.API_BASE_URL;
  return apiUrl.replace('/api', '');
};
export const isDevelopment = () => ENV_CONFIG.IS_DEV;
export const isProduction = () => ENV_CONFIG.IS_PROD;
export const getGoogleClientId = () => ENV_CONFIG.GOOGLE_CLIENT_ID;
