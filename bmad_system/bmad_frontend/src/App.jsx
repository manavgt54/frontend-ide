import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { Badge } from './components/ui/badge';
import { Alert, AlertDescription } from './components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Separator } from './components/ui/separator';
import { ScrollArea } from './components/ui/scroll-area';
import WorkflowManager from './components/WorkflowManager';
import WorkflowSelector from './components/WorkflowSelector';
import AgentManager from './components/AgentManager';
import TaskMonitor from './components/TaskMonitor';
import MCPManager from './components/MCPManager';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Play, 
  Pause, 
  Square, 
  Upload, 
  Settings, 
  Users, 
  Workflow, 
  FileText, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  GripVertical,
  Edit,
  Eye,
  Loader2,
  MessageSquare,
  Bot,
  Send,
  Menu,
  X,
  ChevronRight,
  History
} from 'lucide-react';
import './App.css';

// Backend URL configuration - VM static IP
const API_BASE_URL = 'http://157.66.191.31:5006/api';

// Sortable Workflow Item Component
function SortableWorkflowItem({ agentName, index, agents, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agentName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 border rounded bg-background transition-colors sortable-item ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4 text-gray-400 grip-handle" />
      <div className="flex-1">
        <div className="font-medium">
          {agents[agentName]?.display_name || agentName}
        </div>
        <div className="text-sm text-gray-600">
          Step {index + 1}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

function App() {
  // State management
  const [activeSection, setActiveSection] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [currentTask, setCurrentTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [config, setConfig] = useState({});
  const [usage, setUsage] = useState({});
  const [agents, setAgents] = useState({});
  const [defaultWorkflow, setDefaultWorkflow] = useState([]);
  const [customWorkflow, setCustomWorkflow] = useState([]);
  const [customAgentPrompts, setCustomAgentPrompts] = useState({});
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [editingAgent, setEditingAgent] = useState(null);
  const [editingPrompt, setEditingPrompt] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleAddSelectedFiles = (fileList) => {
    const newFiles = Array.from(fileList || []);
    if (newFiles.length === 0) return;
    // Deduplicate by name+size (basic heuristic)
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map(f => `${f.name}:${f.size}`));
      const appended = [...prev];
      for (const f of newFiles) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          appended.push(f);
          seen.add(key);
        }
      }
      return appended;
    });
  };

  const handleRemoveSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Available models
  const availableModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro'
  ];

  // Navigation items
  const navigationItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare, description: 'Create and manage tasks' },
    { id: 'agents', label: 'Agents', icon: Users, description: 'Manage agent prompts' },
    { id: 'workflows', label: 'Workflows', icon: Workflow, description: 'Configure workflows' },
    { id: 'mcp', label: 'MCP', icon: Settings, description: 'Manage MCP servers' },
    { id: 'monitor', label: 'Monitor', icon: Activity, description: 'Track task progress' },
    { id: 'settings', label: 'Settings', icon: Settings, description: 'System configuration' }
  ];

  // Fetch data on component mount
  useEffect(() => {
    fetchTasks();
    fetchConfig();
    fetchUsage();
    fetchAgents();
    fetchDefaultWorkflow();
  }, []);

  // Debug section changes
  useEffect(() => {
    console.log('Active section changed to:', activeSection);
    console.log('Current state:', {
      tasks: tasks.length,
      chatHistory: chatHistory.length,
      agents: Object.keys(agents).length,
      isSubmitting
    });
  }, [activeSection, tasks, chatHistory, agents, isSubmitting]);

  // API functions
  const fetchTasks = async () => {
    try {
      console.log('Fetching tasks from:', `${API_BASE_URL}/tasks`);
      const response = await fetch(`${API_BASE_URL}/tasks`);
      console.log('Tasks response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tasks data:', data);
        setTasks(data.tasks || []);
      } else {
        console.error('Failed to fetch tasks:', response.status);
        setTasks([]);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    }
  };

  const fetchConfig = async () => {
    try {
      console.log('Fetching config from:', `${API_BASE_URL}/config`);
      const response = await fetch(`${API_BASE_URL}/config`);
      console.log('Config response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Config data:', data);
        setConfig(data);
        setSelectedModel(data.current_model || 'gemini-2.5-flash');
      } else {
        console.error('Failed to fetch config:', response.status);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const fetchUsage = async () => {
    try {
      console.log('Fetching usage from:', `${API_BASE_URL}/usage/summary`);
      const response = await fetch(`${API_BASE_URL}/usage/summary`);
      console.log('Usage response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Usage data:', data);
        setUsage(data);
      } else {
        console.error('Failed to fetch usage:', response.status);
      }
    } catch (error) {
      console.error('Error fetching usage:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      console.log('Fetching agents from:', `${API_BASE_URL}/agents/prompts`);
      const response = await fetch(`${API_BASE_URL}/agents/prompts`);
      console.log('Agents response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Agents data:', data);
        setAgents(data.agents || {});
      } else {
        console.error('Failed to fetch agents:', response.status);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchDefaultWorkflow = async () => {
    try {
      console.log('Fetching workflow from:', `${API_BASE_URL}/workflows/default`);
      const response = await fetch(`${API_BASE_URL}/workflows/default`);
      console.log('Workflow response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Workflow data:', data);
        setDefaultWorkflow(data.workflow_sequence || []);
        setCustomWorkflow(data.workflow_sequence || []);
      } else {
        console.error('Failed to fetch workflow:', response.status);
      }
    } catch (error) {
      console.error('Error fetching default workflow:', error);
    }
  };

  // Notification helper
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Task submission
  const handleSubmitTask = async () => {
    if (!userPrompt.trim()) {
      showNotification('Please enter a prompt', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedSelectedSequence = selectedWorkflow && selectedWorkflow.agent_sequence
        ? (Array.isArray(selectedWorkflow.agent_sequence)
            ? selectedWorkflow.agent_sequence
            : (typeof selectedWorkflow.agent_sequence === 'string'
                ? (() => { try { return JSON.parse(selectedWorkflow.agent_sequence); } catch { return []; } })()
                : []))
        : null;
      const payload = {
        prompt: userPrompt,
        workflow_id: selectedWorkflow?.id || null,
        workflow_sequence: normalizedSelectedSequence || (customWorkflow.length > 0 ? customWorkflow : null),
        agent_specific_prompts: Object.keys(customAgentPrompts).length > 0 ? customAgentPrompts : null
      };

      console.log('Submitting task with payload:', payload);
      console.log('API URL:', `${API_BASE_URL}/tasks`);

      const response = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('Task created successfully:', data);
        
        // Upload any selected files to the task's uploads folder
        if (selectedFiles && selectedFiles.length > 0) {
          for (const file of selectedFiles) {
            const formData = new FormData();
            formData.append('file', file);
            try {
              await fetch(`${API_BASE_URL}/tasks/${data.task_id}/upload`, {
                method: 'POST',
                body: formData,
              });
            } catch (e) {
              console.warn('Upload failed for file', file?.name, e);
            }
          }
          // After uploads complete, trigger requirement_builder to extract from .sureai/uploads
          try {
            await fetch(`${API_BASE_URL}/tasks/${data.task_id}/reexecute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_prompt: 'Analyze all files in .sureai/uploads and for each file create a strict per-file JSON next to it (<basename>.json). Also create an index at .sureai/requirements_extracted.json listing the per-file outputs.',
                workflow_sequence: ['requirement_builder']
              })
            });
          } catch (e) {
            console.warn('Could not trigger requirement builder re-execution', e);
          }
        }
        
        showNotification(`Task created successfully: ${data.task_id}`, 'success');
        
        // Add to chat history
        const newChatItem = {
          id: data.task_id,
          type: 'user',
          content: userPrompt,
          timestamp: new Date(),
          taskId: data.task_id
        };
        
        const botResponse = {
          id: `bot-${data.task_id}`,
          type: 'bot',
          content: `Task created successfully! Task ID: ${data.task_id}. The Adaptive System is now processing your request using ${selectedWorkflow?.name || 'Default'} workflow.`,
          timestamp: new Date(),
          taskId: data.task_id
        };
        
        setChatHistory(prev => [...prev, newChatItem, botResponse]);
        setUserPrompt('');
        setCustomAgentPrompts({});
        setSelectedWorkflow(null);
        setSelectedFiles([]);
        fetchTasks();
        setActiveSection('monitor'); // Automatically switch to monitor screen
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error occurred' }));
        console.error('Task creation failed:', errorData);
        showNotification(`Error: ${errorData.error || 'Failed to create task'}`, 'error');
      }
    } catch (error) {
      console.error('Network error:', error);
      showNotification('Network error occurred. Please check your connection and try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Configuration update
  const handleUpdateConfig = async () => {
    try {
      const payload = {};
      if (apiKey.trim()) payload.gemini_api_key = apiKey;
      if (selectedModel) payload.current_model = selectedModel;

      const response = await fetch(`${API_BASE_URL}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        showNotification('Configuration updated successfully', 'success');
        setApiKey('');
        fetchConfig();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  // Agent prompt management
  const handleUpdateAgentPrompt = async (agentName, newPrompt) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/prompts/${agentName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: newPrompt }),
      });

      if (response.ok) {
        showNotification(`Updated prompt for ${agentName}`, 'success');
        fetchAgents();
        setEditingAgent(null);
        setEditingPrompt('');
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  const handleResetAgentPrompt = async (agentName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/prompts/${agentName}/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        showNotification(`Reset prompt for ${agentName} to default`, 'success');
        fetchAgents();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  // Workflow management
  const addAgentToWorkflow = (agentName) => {
    setCustomWorkflow([...customWorkflow, agentName]);
  };

  const removeAgentFromWorkflow = (index) => {
    const newWorkflow = customWorkflow.filter((_, i) => i !== index);
    setCustomWorkflow(newWorkflow);
  };

  const resetWorkflow = () => {
    setCustomWorkflow([...defaultWorkflow]);
  };

  // Filter out unwanted agents
  const filteredAgents = Object.fromEntries(
    Object.entries(agents).filter(
      ([agentName]) => agentName !== 'beastmode' && agentName !== 'design_architect'
    )
  );

  const filteredWorkflow = customWorkflow.filter(
    (agentName) => agentName !== 'beastmode' && agentName !== 'design_architect'
  );

  // Drag and drop handlers
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setCustomWorkflow((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
      showNotification('Workflow order updated', 'success');
    }
  };

  const handleDragStart = (event) => {
    console.log('Drag started:', event.active.id);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
      case 'received':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  // Render chat interface
  const renderChatInterface = () => {
    console.log('Rendering chat interface, chatHistory length:', chatHistory.length);
    
    try {
      return (
        <div className="flex flex-col h-full bg-background">
          {/* Chat Header */}
          <div className="border-b border-border p-4 bg-card">
            <h2 className="text-lg font-semibold adaptive-system-text-primary">Adaptive System Assistant</h2>
            <p className="text-sm adaptive-system-text-muted">Ask me to create any development project</p>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {chatHistory.length === 0 ? (
                <div className="text-center py-8 adaptive-system-text-muted">
                  <Bot className="w-12 h-12 mx-auto mb-4 adaptive-system-text-muted" />
                  <p>Start a conversation by describing what you want to build</p>
                </div>
              ) : (
                chatHistory.map((message, index) => (
                  <div key={message.id || index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 ${
                      message.type === 'user' 
                        ? 'adaptive-system-button-primary' 
                        : 'adaptive-system-card'
                    }`}>
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp ? message.timestamp.toLocaleTimeString() : new Date().toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat Input */}
          <div className="border-t border-border p-4 bg-card">
            <div className="space-y-4">
              {/* Model and Workflow Selection */}
              <div>
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => setShowWorkflowSelector(!showWorkflowSelector)}
                >
                  {selectedWorkflow ? selectedWorkflow.name : 'Select Workflow'}
                </Button>
              </div>

              {/* Workflow Selector */}
              {showWorkflowSelector && (
                <WorkflowSelector
                  onWorkflowSelect={(workflow) => {
                    setSelectedWorkflow(workflow);
                    setShowWorkflowSelector(false);
                  }}
                  selectedWorkflow={selectedWorkflow}
                  agents={filteredAgents}
                />
              )}

              {/* Chat Input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Describe what you want to build. For example: 'Create a React todo app with authentication and data persistence'"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  className="flex-1 min-h-[60px] max-h-[120px] resize-none adaptive-system-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitTask();
                    }
                  }}
                />
                <div className="flex flex-col items-end gap-2">
                  <input
                    id="chat-file-upload"
                    type="file"
                    multiple
                    onChange={(e) => {
                      handleAddSelectedFiles(e.target.files);
                      // Reset input so selecting the same file again triggers change
                      e.target.value = null;
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('chat-file-upload')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" /> Attach
                    </Button>
                    {selectedFiles?.length > 0 && (
                      <span className="text-xs adaptive-system-text-muted">{selectedFiles.length} file(s)</span>
                    )}
                  </div>
                 {selectedFiles?.length > 0 && (
                   <div className="flex flex-wrap gap-2 max-w-[480px] justify-end">
                     {selectedFiles.map((f, idx) => (
                       <div key={`${f.name}:${f.size}:${idx}`} className="flex items-center gap-2 px-2 py-1 rounded border adaptive-system-card text-xs">
                         <span className="truncate max-w-[220px]" title={`${f.name} (${(f.size/1024).toFixed(1)} KB)`}>{f.name}</span>
                         <button
                           className="text-red-400 hover:text-red-500"
                           onClick={() => handleRemoveSelectedFile(idx)}
                           aria-label={`Remove ${f.name}`}
                         >
                           <X className="w-3 h-3" />
                         </button>
                       </div>
                     ))}
                   </div>
                 )}
                  <Button 
                    onClick={handleSubmitTask} 
                    disabled={!userPrompt.trim() || isSubmitting}
                    size="icon"
                    className="self-end adaptive-system-button-primary"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering chat interface:', error);
      return (
        <div className="flex flex-col h-full items-center justify-center bg-background">
          <div className="text-center adaptive-system-text-muted">
            <Bot className="w-12 h-12 mx-auto mb-4 adaptive-system-text-muted" />
            <p>Error loading chat interface</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 adaptive-system-button-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
  };

  // Render agents section
  const renderAgentsSection = () => (
    <div className="space-y-6">
      <AgentManager />
    </div>
  );

  // Render workflows section
  const renderWorkflowsSection = () => (
    <div className="space-y-6">
      <WorkflowManager 
        agents={filteredAgents} 
        onWorkflowSelect={(workflow) => {
          setSelectedWorkflow(workflow);
          const seq = Array.isArray(workflow.agent_sequence)
            ? workflow.agent_sequence
            : (typeof workflow.agent_sequence === 'string'
                ? (() => { try { return JSON.parse(workflow.agent_sequence); } catch { return []; } })()
                : []);
          setCustomWorkflow(seq);
        }}
      />
    </div>
  );

  // Render monitor section
  const renderMonitorSection = () => {
    try {
      return (
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-2xl font-bold adaptive-system-text-primary">Task Monitor</h2>
            <p className="adaptive-system-text-muted">Track the progress of your development tasks</p>
          </div>
          
          {/* Task Cards Selector */}
          <div className="grid md:grid-cols-3 gap-3">
            {(tasks || []).map((t) => (
              <Card key={`card-${t.task_id}`} className={`adaptive-system-card cursor-pointer ${selectedTaskId === t.task_id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedTaskId(selectedTaskId === t.task_id ? null : t.task_id)}>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium adaptive-system-text-primary">Task {t.task_id.slice(0,8)}</div>
                    <div className="text-xs adaptive-system-text-muted">{(t.status || '').replace('_',' ')}</div>
                  </div>
                  <div className="text-xs adaptive-system-text-muted truncate mt-1">{t.prompt}</div>
                </div>
              </Card>
            ))}
          </div>
          
          <div className="space-y-4">
            {!tasks || tasks.length === 0 ? (
              <div className="text-center py-8 adaptive-system-text-muted">
                <Activity className="w-12 h-12 mx-auto mb-4 adaptive-system-text-muted" />
                <p>No tasks created yet. Create your first task to get started.</p>
              </div>
            ) : (
              (selectedTaskId ? tasks.filter((t) => t.task_id === selectedTaskId) : tasks).map((task) => {
                try {
                  return (
                    <TaskMonitor 
                      key={task.task_id} 
                      task={task} 
                      onRefresh={fetchTasks}
                    />
                  );
                } catch (taskError) {
                  console.error('Error rendering task:', task, taskError);
                  return (
                    <Card key={task.task_id} className="p-4 adaptive-system-card border-red-200">
                      <div className="text-red-600">
                        <p>Error displaying task: {task.task_id}</p>
                        <p className="text-xs">{taskError.message}</p>
                      </div>
                    </Card>
                  );
                }
              })
            )}
          </div>
        </div>
      );
    } catch (error) {
      console.error('Error rendering monitor section:', error);
      return (
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-2xl font-bold adaptive-system-text-primary">Task Monitor</h2>
            <p className="adaptive-system-text-muted">Track the progress of your development tasks</p>
          </div>
          
          <div className="text-center py-8 adaptive-system-text-muted">
            <Activity className="w-12 h-12 mx-auto mb-4 adaptive-system-text-muted" />
            <p>Error loading task monitor</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 adaptive-system-button-primary"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
  };

  // Render settings section
  const renderSettingsSection = () => (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold adaptive-system-text-primary">System Configuration</h2>
        <p className="adaptive-system-text-muted">Configure API keys, models, and system settings</p>
      </div>
      
      <div className="grid gap-6">
        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="adaptive-system-text-primary">API Configuration</CardTitle>
            <CardDescription className="adaptive-system-text-muted">Configure your Gemini API settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="adaptive-system-text-primary">Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your Gemini API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="adaptive-system-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model" className="adaptive-system-text-primary">Model Selection</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="adaptive-system-input">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpdateConfig}>
              <Save className="w-4 h-4 mr-2" />
              Update Configuration
            </Button>
          </CardContent>
        </Card>
        
        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="adaptive-system-text-primary">System Status</CardTitle>
            <CardDescription className="adaptive-system-text-muted">Current system configuration and usage statistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="adaptive-system-text-primary">Current Model</Label>
                <div className="p-2 adaptive-system-card rounded">
                  <span className="adaptive-system-text-primary">{config.current_model || 'Not configured'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="adaptive-system-text-primary">API Status</Label>
                <div className="p-2 adaptive-system-card rounded">
                  <span className="adaptive-system-text-primary">{config.api_key_configured ? 'Configured' : 'Not configured'}</span>
                </div>
              </div>
            </div>
            
            {/* Usage Statistics */}
            <div className="space-y-2">
              <Label className="adaptive-system-text-primary">Usage Statistics</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 adaptive-system-card rounded">
                  <div className="text-sm adaptive-system-accent">Total Requests</div>
                  <div className="text-lg font-semibold adaptive-system-text-primary">{usage.total_requests || 0}</div>
                </div>
                <div className="p-3 adaptive-system-card rounded">
                  <div className="text-sm adaptive-system-accent">Total Tokens</div>
                  <div className="text-lg font-semibold adaptive-system-text-primary">{usage.total_tokens || 0}</div>
                </div>
                <div className="p-3 adaptive-system-card rounded">
                  <div className="text-lg font-semibold adaptive-system-text-primary">${(usage.total_cost || 0).toFixed(4)}</div>
                  <div className="text-sm adaptive-system-accent">Total Cost</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="h-screen dark-theme">
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50">
          <Alert className={`adaptive-system-card ${notification.type === 'error' ? 'border-red-500' : 
                                   notification.type === 'success' ? 'border-green-500' : 
                                   'border-blue-500'}`}>
            <AlertDescription className="adaptive-system-text-primary">
              {notification.message}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Debug Info - Remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 left-4 z-40 adaptive-system-card p-2 rounded border text-xs">
          <div className="adaptive-system-text-primary">Active Section: {activeSection}</div>
          <div className="adaptive-system-text-primary">Tasks: {tasks.length}</div>
          <div className="adaptive-system-text-primary">Chat History: {chatHistory.length}</div>
        </div>
      )}

      <div className="flex h-full">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-16'} adaptive-system-sidebar transition-all duration-300 flex flex-col`}>
          {/* Sidebar Header */}
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-between">
              {sidebarOpen && (
                <div>
                  <h1 className="text-xl font-bold adaptive-system-text-primary">Adaptive System</h1>
                  <p className="text-xs adaptive-system-text-muted">Multi-Agent System</p>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="adaptive-system-button-secondary"
              >
                {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2">
            <div className="space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? 'adaptive-system-button-primary'
                        : 'adaptive-system-button-secondary hover:bg-accent'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {sidebarOpen && (
                      <div className="flex-1 text-left">
                        <div className="adaptive-system-text-primary">{item.label}</div>
                        {sidebarOpen && (
                          <div className="text-xs adaptive-system-text-muted truncate">
                            {item.description}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Chat History */}
          {sidebarOpen && activeSection === 'chat' && (
            <div className="border-t border-sidebar-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 adaptive-system-text-primary" />
                <span className="text-sm font-medium adaptive-system-text-primary">Recent Tasks</span>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-2">
                  {tasks.slice(0, 5).map((task) => (
                    <button
                      key={task.task_id}
                      onClick={() => {
                        setCurrentTask(task);
                        setActiveSection('chat');
                      }}
                      className="w-full text-left p-2 rounded text-xs adaptive-system-button-secondary hover:bg-accent transition-colors"
                    >
                      <div className="font-medium truncate adaptive-system-text-primary">
                        Task {task.task_id.slice(0, 8)}
                      </div>
                      <div className="adaptive-system-text-muted truncate">
                        {typeof task.prompt === 'string' ? task.prompt.substring(0, 50) + '...' : 'No prompt available'}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-background">
          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeSection === 'chat' && (
              <div className="h-full overflow-y-auto bg-background">
                {(() => {
                  try {
                    return renderChatInterface();
                  } catch (error) {
                    console.error('Error rendering chat interface:', error);
                    return (
                      <div className="flex flex-col h-full items-center justify-center bg-background">
                        <div className="text-center adaptive-system-text-muted">
                          <Bot className="w-12 h-12 mx-auto mb-4 adaptive-system-text-muted" />
                          <p>Error loading chat interface</p>
                          <button 
                            onClick={() => window.location.reload()}
                            className="mt-4 adaptive-system-button-primary"
                          >
                            Reload Page
                          </button>
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            {activeSection === 'agents' && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                {(() => {
                  try {
                    return renderAgentsSection();
                  } catch (error) {
                    console.error('Error rendering agents section:', error);
                    return (
                      <div className="text-center py-8 adaptive-system-text-muted">
                        <p>Error loading agents section</p>
                        <button 
                          onClick={() => window.location.reload()}
                          className="mt-4 adaptive-system-button-primary"
                        >
                          Reload Page
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            {activeSection === 'workflows' && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                {(() => {
                  try {
                    return renderWorkflowsSection();
                  } catch (error) {
                    console.error('Error rendering workflows section:', error);
                    return (
                      <div className="text-center py-8 adaptive-system-text-muted">
                        <p>Error loading workflows section</p>
                        <button 
                          onClick={() => window.location.reload()}
                          className="mt-4 adaptive-system-button-primary"
                        >
                          Reload Page
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            {activeSection === 'mcp' && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                <MCPManager />
              </div>
            )}
            {activeSection === 'monitor' && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                {(() => {
                  try {
                    return renderMonitorSection();
                  } catch (error) {
                    console.error('Error rendering monitor section:', error);
                    return (
                      <div className="text-center py-8 adaptive-system-text-muted">
                        <p>Error loading monitor section</p>
                        <button 
                          onClick={() => window.location.reload()}
                          className="mt-4 adaptive-system-button-primary"
                        >
                          Reload Page
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            {activeSection === 'settings' && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                {(() => {
                  try {
                    return renderSettingsSection();
                  } catch (error) {
                    console.error('Error rendering settings section:', error);
                    return (
                      <div className="text-center py-8 adaptive-system-text-muted">
                        <p>Error loading settings section</p>
                        <button 
                          onClick={() => window.location.reload()}
                          className="mt-4 adaptive-system-button-primary"
                        >
                          Reload Page
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            {/* Fallback for unknown sections */}
            {!['chat', 'agents', 'workflows', 'monitor', 'settings'].includes(activeSection) && (
              <div className="h-full overflow-y-auto p-6 bg-background">
                <div className="text-center py-8 adaptive-system-text-muted">
                  <p>Unknown section: {activeSection}</p>
                  <button 
                    onClick={() => setActiveSection('chat')}
                    className="mt-4 adaptive-system-button-primary"
                  >
                    Go to Chat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

