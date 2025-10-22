import React, { useState, useEffect, useRef } from 'react';
import { BACKEND_URL } from '../lib/api';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'frontend' | 'backend' | 'database' | 'api';
  message: string;
  data: any;
  sessionId?: string;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  bySession: Record<string, number>;
}

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    sessionId: ''
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.level) params.append('level', filters.level);
      if (filters.category) params.append('category', filters.category);
      if (filters.sessionId) params.append('sessionId', filters.sessionId);
      params.append('limit', '200');

      const response = await fetch(`${BACKEND_URL}/logs?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      setLogs(data.logs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/logs/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.warn('Failed to fetch stats:', err);
    }
  };

  const fetchDatabaseLogs = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/logs/database`);
      if (response.ok) {
        const data = await response.json();
        console.log('Database logs:', data);
      }
    } catch (err) {
      console.warn('Failed to fetch database logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchDatabaseLogs();
  }, [filters]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, filters]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      case 'info': return 'text-blue-600 bg-blue-50';
      case 'debug': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'frontend': return 'bg-green-100 text-green-800';
      case 'backend': return 'bg-blue-100 text-blue-800';
      case 'database': return 'bg-purple-100 text-purple-800';
      case 'api': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const clearLogs = async () => {
    try {
      await fetch(`${BACKEND_URL}/logs`, { method: 'DELETE' });
      setLogs([]);
      fetchStats();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">Loading logs...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">System Logs</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1 rounded text-sm ${
                autoRefresh ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}
            >
              {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
            </button>
            <button
              onClick={clearLogs}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Clear Logs
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-100 p-3 rounded">
              <div className="text-sm text-gray-600">Total Logs</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <div className="text-sm text-gray-600">Errors</div>
              <div className="text-2xl font-bold text-red-500">{stats.byLevel.error || 0}</div>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <div className="text-sm text-gray-600">Warnings</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.byLevel.warn || 0}</div>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <div className="text-sm text-gray-600">API Calls</div>
              <div className="text-2xl font-bold text-blue-600">{stats.byCategory.api || 0}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4">
          <select
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            className="px-3 py-1 border rounded"
          >
            <option value="">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="px-3 py-1 border rounded"
          >
            <option value="">All Categories</option>
            <option value="frontend">Frontend</option>
            <option value="backend">Backend</option>
            <option value="database">Database</option>
            <option value="api">API</option>
          </select>
          
          <input
            type="text"
            placeholder="Session ID"
            value={filters.sessionId}
            onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}
            className="px-3 py-1 border rounded flex-1"
          />
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-auto" ref={logContainerRef}>
        {error && (
          <div className="p-4 bg-red-50 text-red-700">
            Error: {error}
          </div>
        )}
        
        {logs.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No logs found
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white border rounded p-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(log.category)}`}>
                      {log.category}
                    </span>
                    {log.sessionId && (
                      <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                        {log.sessionId.substring(0, 8)}...
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                <div className="text-sm font-medium mb-1">{log.message}</div>
                
                {log.data && Object.keys(log.data).length > 0 && (
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer hover:text-gray-800">Data</summary>
                    <pre className="mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogViewer;

