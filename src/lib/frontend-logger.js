// Frontend API Call Logger
class FrontendLogger {
  constructor() {
    this.backendUrl = import.meta.env.VITE_BACKEND_URL || 'https://ai-ide-5.onrender.com';
    this.sessionId = this.getSessionId();
    this.isEnabled = true;
    this.logQueue = [];
    this.maxQueueSize = 100;
    
    // Start periodic log flushing
    this.startLogFlushing();
    
    // Log page load
    this.log('info', 'frontend', 'Page loaded', {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
  }

  getSessionId() {
    try {
      const authUser = localStorage.getItem('auth_user');
      if (authUser) {
        const parsed = JSON.parse(authUser);
        return parsed.sessionId;
      }
    } catch (error) {
      console.warn('Failed to get session ID:', error);
    }
    return null;
  }

  log(level, category, message, data = {}) {
    if (!this.isEnabled) return;

    const logEntry = {
      level,
      category,
      message,
      data: {
        ...data,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        url: window.location.href
      }
    };

    // Add to queue
    this.logQueue.push(logEntry);
    
    // Keep queue size manageable
    if (this.logQueue.length > this.maxQueueSize) {
      this.logQueue = this.logQueue.slice(-this.maxQueueSize);
    }

    // Log to console for debugging
    console.log(`[${level.toUpperCase()}] ${category}: ${message}`, data);
  }

  async flushLogs() {
    if (this.logQueue.length === 0) return;

    try {
      const logsToSend = [...this.logQueue];
      this.logQueue = [];

      const response = await fetch(`${this.backendUrl}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: 'info',
          category: 'frontend',
          message: 'Batch log flush',
          data: {
            logs: logsToSend,
            count: logsToSend.length,
            sessionId: this.sessionId
          }
        })
      });

      if (!response.ok) {
        console.warn('Failed to send logs to backend:', response.status);
        // Re-add logs to queue if sending failed
        this.logQueue.unshift(...logsToSend);
      }
    } catch (error) {
      console.warn('Error sending logs to backend:', error);
      // Re-add logs to queue if sending failed
      this.logQueue.unshift(...this.logQueue);
    }
  }

  startLogFlushing() {
    // Flush logs every 5 seconds
    setInterval(() => {
      this.flushLogs();
    }, 5000);

    // Flush logs before page unload
    window.addEventListener('beforeunload', () => {
      this.flushLogs();
    });
  }

  // Log API calls
  logApiCall(method, url, status, duration, data = {}) {
    this.log('info', 'api', `API Call: ${method} ${url}`, {
      method,
      url,
      status,
      duration,
      ...data
    });
  }

  // Log errors
  logError(error, context = {}) {
    this.log('error', 'frontend', 'Frontend Error', {
      error: error.message,
      stack: error.stack,
      ...context
    });
  }

  // Log user actions
  logUserAction(action, data = {}) {
    this.log('info', 'frontend', `User Action: ${action}`, data);
  }

  // Log file operations
  logFileOperation(operation, filename, data = {}) {
    this.log('info', 'frontend', `File ${operation}: ${filename}`, {
      filename,
      operation,
      ...data
    });
  }

  // Log drag and drop events
  logDragDrop(event, files) {
    this.log('info', 'frontend', 'Drag and Drop Event', {
      event,
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      fileSizes: files.map(f => f.size)
    });
  }
}

// Create global logger instance
const frontendLogger = new FrontendLogger();

// Export for use in other modules
export default frontendLogger;

// Also make it available globally for easy access
window.frontendLogger = frontendLogger;

