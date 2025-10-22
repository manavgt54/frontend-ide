// API Call Interceptor for automatic logging
import frontendLogger from './frontend-logger.js';

// Store original fetch
const originalFetch = window.fetch;

// Override fetch to intercept all API calls
window.fetch = async function(...args) {
  const startTime = Date.now();
  const [url, options = {}] = args;
  
  // Extract method and URL
  const method = options.method || 'GET';
  const fullUrl = typeof url === 'string' ? url : url.toString();
  
  // Log the API call start
  frontendLogger.log('info', 'api', `API Call Started: ${method} ${fullUrl}`, {
    method,
    url: fullUrl,
    headers: options.headers,
    body: options.body ? (typeof options.body === 'string' ? options.body.substring(0, 200) : 'Binary data') : undefined
  });

  try {
    // Make the actual API call
    const response = await originalFetch.apply(this, args);
    const duration = Date.now() - startTime;
    
    // Log successful response
    frontendLogger.logApiCall(method, fullUrl, response.status, duration, {
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    // If it's an error status, log it as an error
    if (!response.ok) {
      frontendLogger.log('warn', 'api', `API Error: ${method} ${fullUrl}`, {
        status: response.status,
        statusText: response.statusText,
        duration
      });
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Log network errors
    frontendLogger.log('error', 'api', `API Network Error: ${method} ${fullUrl}`, {
      error: error.message,
      duration
    });
    
    throw error;
  }
};

// Also intercept XMLHttpRequest for older code
const originalXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  const xhr = new originalXHR();
  const originalOpen = xhr.open;
  const originalSend = xhr.send;
  
  let method, url, startTime;
  
  xhr.open = function(m, u, ...args) {
    method = m;
    url = u;
    startTime = Date.now();
    
    frontendLogger.log('info', 'api', `XHR Call Started: ${method} ${url}`);
    
    return originalOpen.apply(this, [m, u, ...args]);
  };
  
  xhr.send = function(data) {
    const originalOnLoad = xhr.onload;
    const originalOnError = xhr.onerror;
    
    xhr.onload = function() {
      const duration = Date.now() - startTime;
      frontendLogger.logApiCall(method, url, xhr.status, duration, {
        statusText: xhr.statusText
      });
      
      if (originalOnLoad) originalOnLoad.apply(this, arguments);
    };
    
    xhr.onerror = function() {
      const duration = Date.now() - startTime;
      frontendLogger.log('error', 'api', `XHR Error: ${method} ${url}`, {
        duration
      });
      
      if (originalOnError) originalOnError.apply(this, arguments);
    };
    
    return originalSend.apply(this, arguments);
  };
  
  return xhr;
};

console.log('🔍 API Interceptor initialized - all API calls will be logged');

