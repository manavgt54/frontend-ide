import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Activity, Play, Pause, X, Download, RefreshCw } from 'lucide-react';

const TaskMonitor = ({ task, onRefresh }) => {
  const [monitorData, setMonitorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScrollLogs, setAutoScrollLogs] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState([]);
  const logsEndRef = useRef(null);
  const refreshIntervalRef = useRef(null);
  const lastLogsKeyRef = useRef('');
  const [geminiError, setGeminiError] = useState(null);
  const [rePrompt, setRePrompt] = useState('');
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [memory, setMemory] = useState({ history: [] });
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  const fetchMonitorData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tasks/${task.task_id}/monitor`);
      if (!response.ok) {
        throw new Error('Failed to fetch monitor data');
      }
      const data = await response.json();
      // Ensure workflow_sequence is always an array to avoid UI crashes
      const normalizedSequence = Array.isArray(data.workflow_sequence)
        ? data.workflow_sequence
        : (typeof data.workflow_sequence === 'string'
            ? (() => { try { return JSON.parse(data.workflow_sequence); } catch { return []; } })()
            : []);
      data.workflow_sequence = normalizedSequence;
      // Compute a lightweight signature of logs to detect changes
      const logs = Array.isArray(data.cli_logs) ? data.cli_logs : [];
      const last = logs.length ? logs[logs.length - 1] : null;
      const newKey = `${logs.length}|${last?.timestamp ?? ''}|${last?.level ?? ''}|${last?.message ?? ''}`;
      if (newKey !== lastLogsKeyRef.current) {
        // Deduplicate logs by timestamp+level+message
        const seen = new Set();
        const uniqueLogs = [];
        for (const log of logs) {
          const id = `${log.timestamp}|${log.level}|${log.message}`;
          if (!seen.has(id)) {
            seen.add(id);
            uniqueLogs.push(log);
          }
        }
        lastLogsKeyRef.current = newKey;
        setVisibleLogs(uniqueLogs);
        setMonitorData({ ...data, cli_logs: uniqueLogs });
        setGeminiError(extractGeminiError(uniqueLogs));
      } else {
        // No change in logs; keep existing visibleLogs but update other fields
        setMonitorData((prev) => ({ ...data, cli_logs: visibleLogs }));
        setGeminiError((prev) => prev || extractGeminiError(visibleLogs));
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching monitor data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemory = async () => {
    try {
      const res = await fetch(`/api/tasks/${task.task_id}/memory`);
      if (res.ok) {
        const data = await res.json();
        setMemory({ history: Array.isArray(data.history) ? data.history : [] });
      }
    } catch (e) {
      // non-fatal
    }
  };

  const saveMemory = async () => {
    try {
      setSavingMemory(true);
      const parsed = JSON.parse(memoryDraft);
      const res = await fetch(`/api/tasks/${task.task_id}/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: parsed.history || [] })
      });
      if (!res.ok) {
        throw new Error('Failed to save memory');
      }
      setShowMemoryModal(false);
      fetchMemory();
    } catch (e) {
      alert(e.message || 'Failed to save memory');
    } finally {
      setSavingMemory(false);
    }
  };

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const extractGeminiError = (logs) => {
    if (!Array.isArray(logs)) return null;
    // Scan newest-first for clear API error signals
    for (let i = logs.length - 1; i >= 0; i--) {
      const msg = (logs[i]?.message || '').toLowerCase();
      const lvl = (logs[i]?.level || '').toLowerCase();
      const isApiErr = msg.includes('apierror') || msg.includes('status: 429') || msg.includes('resource_exhausted') || msg.includes('too many requests') || msg.includes('exceeded your current quota') || msg.includes('quota');
      if (isApiErr) {
        let code = '429';
        if (msg.includes('401') || msg.includes('unauthorized')) code = '401';
        if (msg.includes('403') || msg.includes('forbidden')) code = '403';
        return {
          code,
          level: lvl || 'error',
          message: 'Gemini API error detected. Your API key may be out of quota or rate-limited. Please update the key or wait for quota reset.'
        };
      }
    }
    return null;
  };

  useEffect(() => {
    fetchMonitorData();
    fetchMemory();
    // Load available workflows for re-execution selector
    (async () => {
      try {
        const res = await fetch('/api/workflows');
        if (res.ok) {
          const data = await res.json();
          setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
        }
      } catch (e) {
        // Non-fatal
      }
    })();
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [task.task_id]);

  useEffect(() => {
    // Auto-refresh every 2 seconds if task is in progress (prefer monitor status if available)
    const status = monitorData?.status || task.status;
    if (autoRefresh && status === 'in_progress') {
      if (!refreshIntervalRef.current) {
        refreshIntervalRef.current = setInterval(() => { fetchMonitorData(); fetchMemory(); }, 2000);
      }
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }
    return () => {
      if (refreshIntervalRef.current && (!autoRefresh || status !== 'in_progress')) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, monitorData?.status, task.status]);

  useEffect(() => {
    if (autoScrollLogs) {
      scrollToBottom();
    }
  }, [visibleLogs]);

  const currentStatus = monitorData?.status || task.status;

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      case 'paused': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'in_progress': return '🔄';
      case 'failed': return '❌';
      case 'paused': return '⏸️';
      default: return '⏳';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-yellow-400';
      case 'info': return 'text-blue-400';
      case 'debug': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  const getAgentIcon = (agentName) => {
    const icons = {
      'analyst': '📊',
      'architect': '🏗️',
      'pm': '📋',
      'sm': '📅',
      'developer': '💻',
      'devops': '🚀',
      'tester': '🧪',
      'po': '👤',
      'orchestrator': '🧠',
      'directory_structure': '🗂️'
    };
    return icons[agentName] || '🤖';
  };

  const memorySummary = (() => {
    const hist = Array.isArray(memory.history) ? memory.history : [];
    if (hist.length === 0) return 'No memory yet';
    const last = hist[hist.length - 1];
    const completed = (last.agents_progress?.completed || []).length;
    const remaining = (last.agents_progress?.remaining || []).length;
    return `Last prompt: "${(last.prompt || '').slice(0, 80)}" — ${completed} done, ${remaining} remaining`;
  })();

  if (loading && !monitorData) {
    return (
      <Card className="adaptive-system-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading monitor data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="adaptive-system-card border-red-200">
        <CardContent className="p-6">
          <div className="text-red-600">
            <p>Error loading monitor data: {error}</p>
            <Button onClick={fetchMonitorData} className="mt-2">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Gemini API Error Banner */}
      {geminiError && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <span className="text-red-400 text-xl">⚠️</span>
              <div>
                <p className="font-semibold text-red-400">Gemini API Error {geminiError.code}</p>
                <p className="text-sm text-red-300">
                  {geminiError.message}
                </p>
                <p className="text-xs text-red-300 mt-1">
                  Tip: Rotate/update your API key in settings, or wait for quota reset. Large context requests are minimized via code-tree manifests.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Re-execute Controls */}
      <Card className="adaptive-system-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔁</span>
              <div>
                <CardTitle className="adaptive-system-text-primary">Re-run Workflow on This Task</CardTitle>
                <p className="text-sm adaptive-system-text-muted">Choose a workflow and apply a new prompt to modify/fix in-place. Runs in the same project folder.</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => { setMemoryDraft(JSON.stringify({ history: memory.history }, null, 2)); setShowMemoryModal(true); }}>
                View/Edit Memory
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs adaptive-system-text-muted">{memorySummary}</div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <textarea
                className="w-full adaptive-system-input h-20"
                placeholder="Enter modification/fix prompt (e.g., Update navbar color and fix login API error)"
                value={rePrompt || ''}
                onChange={(e) => setRePrompt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm adaptive-system-text-muted">Workflow</label>
              <select
                className="w-full adaptive-system-input"
                value={selectedWorkflowId || ''}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
              >
                <option value="">Default Workflow</option>
                {(workflows || []).map((wf) => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={async () => {
                if (!rePrompt || !rePrompt.trim()) return;
                try {
                  const body = {
                    user_prompt: rePrompt,
                  };
                  if (selectedWorkflowId) body.workflow_id = selectedWorkflowId;
                  const res = await fetch(`/api/tasks/${task.task_id}/reexecute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Failed to start re-execution');
                  }
                  setRePrompt('');
                  setSelectedWorkflowId('');
                  onRefresh && onRefresh();
                  // Trigger immediate monitor refresh
                  fetchMonitorData();
                  fetchMemory();
                } catch (e) {
                  console.error('Re-execution failed:', e);
                  setError(e.message || 'Failed to start re-execution');
                }
              }}
              className="adaptive-system-button-primary"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Run with New Prompt
            </Button>
            <Button variant="outline" onClick={() => { fetchMonitorData(); fetchMemory(); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh Monitor
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task Header */}
      <Card className="adaptive-system-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">{getStatusIcon(currentStatus)}</span>
              <div>
                <CardTitle className="adaptive-system-text-primary">
                  Task {task.task_id.slice(0, 8)}
                </CardTitle>
                <p className="text-sm adaptive-system-text-muted">{task.prompt}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge 
                variant="outline" 
                className={`${getStatusColor(currentStatus)} text-white`}
              >
                {currentStatus}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'bg-blue-500 text-white' : ''}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh && currentStatus === 'in_progress' ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Section */}
      {monitorData && (
        <Card className="adaptive-system-card overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="adaptive-system-text-primary text-lg">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enhanced Progress Bar */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="adaptive-system-text-muted">Overall Progress</span>
                <span className="adaptive-system-text-primary font-semibold">{monitorData.progress_percentage}%</span>
              </div>
              <div className="relative overflow-hidden">
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 rounded-full transition-all duration-1000 ease-out relative"
                    style={{ 
                      width: `${monitorData.progress_percentage}%`,
                      backgroundSize: '200% 100%',
                      animation: monitorData.progress_percentage > 0 && currentStatus === 'in_progress' ? 'shimmer 2s ease-in-out infinite' : 'none'
                    }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 animate-pulse"></div>
                  </div>
                </div>
                {/* Progress indicator dots (no overflow outside) */}
                {monitorData.workflow_sequence && monitorData.workflow_sequence.length > 0 && (
                  <div className="relative mt-2 h-10 overflow-hidden px-2">
                    {monitorData.workflow_sequence.map((agent, index) => {
                      const isCompleted = monitorData.completed_agents?.includes(agent);
                      const isCurrent = agent === monitorData.current_agent;
                      const lastIndex = monitorData.workflow_sequence.length - 1;
                      const denom = Math.max(1, lastIndex);
                      const leftPct = (index / denom) * 100;
                      // Clamp first and last positions so labels stay inside container
                      const posStyle =
                        index === 0
                          ? { left: '0%', transform: 'translateX(0%)' }
                          : index === lastIndex
                          ? { left: '100%', transform: 'translateX(-100%)' }
                          : { left: `${leftPct}%`, transform: 'translateX(-50%)' };
                      const alignClass = index === 0 ? 'text-left' : index === lastIndex ? 'text-right' : 'text-center';
                      return (
                        <div
                          key={agent}
                          className={`absolute top-0 flex flex-col items-center ${
                            isCompleted ? 'text-green-400' : isCurrent ? 'text-blue-400' : 'text-gray-500'
                          }`}
                          style={posStyle}
                        >
                          <div
                            className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                              isCompleted
                                ? 'bg-green-500 border-green-400'
                                : isCurrent
                                ? 'bg-blue-500 border-blue-400 animate-pulse'
                                : 'bg-gray-600 border-gray-500'
                            }`}
                          ></div>
                          <span className={`text-xs mt-1 hidden sm:block max-w-[96px] truncate ${alignClass} px-1`}>
                            {agent}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Current Agent Display */}
            {monitorData.current_agent && (
              <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20 relative overflow-hidden">
                {/* Animated background */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 animate-pulse"></div>
                
                <div className="relative z-10 flex items-center space-x-3">
                  <div className="relative">
                    <span className="text-3xl">{getAgentIcon(monitorData.current_agent)}</span>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <p className="font-semibold adaptive-system-text-primary text-lg">
                      Currently Running: {monitorData.current_agent}
                    </p>
                    <p className="text-sm adaptive-system-text-muted">
                      Step {monitorData.workflow_sequence?.indexOf(monitorData.current_agent) + 1 || '?'} of {monitorData.workflow_sequence?.length || '?'}
                    </p>
                  </div>
                </div>
                
                {/* Progress indicator */}
                <div className="ml-auto relative z-10">
                  <div className={`w-8 h-8 border-2 ${currentStatus === 'in_progress' ? 'border-blue-400 border-t-transparent animate-spin' : 'border-gray-400'} rounded-full`}></div>
                </div>
              </div>
            )}

            {/* Enhanced Workflow Sequence */}
            {monitorData.workflow_sequence && monitorData.workflow_sequence.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium adaptive-system-text-primary">Workflow Sequence:</p>
                <div className="flex flex-wrap gap-3">
                  {monitorData.workflow_sequence.map((agent, index) => {
                    const isCompleted = monitorData.completed_agents?.includes(agent);
                    const isCurrent = agent === monitorData.current_agent;
                    const isPending = !isCompleted && !isCurrent;
                    
                    return (
                      <div
                        key={agent}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm border transition-all duration-300 ${
                          isCompleted 
                            ? 'bg-green-500/20 border-green-500/40 text-green-400 shadow-lg shadow-green-500/20'
                            : isCurrent
                            ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 shadow-lg shadow-blue-500/20 animate-pulse'
                            : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
                        }`}
                      >
                        <span className="text-lg">{getAgentIcon(agent)}</span>
                        <span className="font-medium">{agent}</span>
                        {isCompleted && (
                          <span className="text-green-400 animate-bounce">✅</span>
                        )}
                        {isCurrent && (
                          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                        )}
                        {isPending && (
                          <span className="text-gray-500">⏳</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Logs Section */}
      <Card className="adaptive-system-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="adaptive-system-text-primary text-lg">Real-time Logs</CardTitle>
            <div className="flex items-center space-x-2">
              <span className="text-sm adaptive-system-text-muted">
                {visibleLogs?.length || 0} logs
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchMonitorData}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant={autoScrollLogs ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoScrollLogs(!autoScrollLogs)}
              >
                {autoScrollLogs ? 'Auto-scroll On' : 'Auto-scroll Off'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-96 w-full">
            <div className="p-4 space-y-2">
              {visibleLogs && visibleLogs.length > 0 ? (
                visibleLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`text-sm font-mono p-2 rounded ${
                      log.level === 'ERROR' 
                        ? 'bg-red-500/10 border border-red-500/20' 
                        : log.level === 'WARNING'
                        ? 'bg-yellow-500/10 border border-yellow-500/20'
                        : 'bg-gray-500/10 border border-gray-500/20'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      <span className={`text-xs ${getLogLevelColor(log.level)}`}>
                        [{log.level || 'INFO'}]
                      </span>
                      <span className="text-xs adaptive-system-text-muted">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className={`mt-1 ${getLogLevelColor(log.level)}`}>
                      {log.message}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 adaptive-system-text-muted">
                  <Activity className="w-8 h-8 mx-auto mb-2" />
                  <p>No logs available yet</p>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Memory Modal */}
      {showMemoryModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <CardTitle className="adaptive-system-text-primary">Task Memory</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowMemoryModal(false)}>
                Close
              </Button>
            </div>
            <p className="text-xs adaptive-system-text-muted mb-2">Edit as JSON. Only user prompts and agent progress are stored.</p>
            <textarea
              className="w-full h-72 adaptive-system-input font-mono"
              value={memoryDraft}
              onChange={(e) => setMemoryDraft(e.target.value)}
            />
            <div className="mt-3 flex items-center justify-end space-x-2">
              <Button variant="outline" onClick={() => setMemoryDraft(JSON.stringify({ history: memory.history }, null, 2))}>Reset</Button>
              <Button onClick={saveMemory} disabled={savingMemory}>
                {savingMemory ? 'Saving…' : 'Save Memory'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskMonitor;

