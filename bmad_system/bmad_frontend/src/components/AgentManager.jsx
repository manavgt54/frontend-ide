import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Copy, 
  MoreVertical,
  Save,
  X,
  RotateCcw,
  CheckCircle,
  Clock,
  Bot,
  Settings
} from 'lucide-react';

// Backend URL configuration
const API_BASE_URL = 'http://157.66.191.31:5006/api';

// Agent Card Component
function AgentCard({ agent, agentName, onEdit, onCopy, onDelete, onReset }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Card className="relative hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-lg">{agent.display_name || agentName}</CardTitle>
              {agent.is_custom && (
                <Badge variant="secondary" className="text-xs">
                  Custom
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              {agent.description || 'No description'}
            </CardDescription>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-10 bg-background border rounded-md shadow-lg min-w-[120px]">
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    onEdit(agent, agentName);
                    setShowMenu(false);
                  }}
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    onCopy(agent, agentName);
                    setShowMenu(false);
                  }}
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
                {!agent.is_custom && (
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                    onClick={() => {
                      onReset(agentName);
                      setShowMenu(false);
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-red-600"
                  onClick={() => {
                    onDelete(agent, agentName);
                    setShowMenu(false);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          {agent.is_modified && (
            <Badge variant="outline" className="text-xs">
              Modified
            </Badge>
          )}
          <span className="text-xs text-gray-500">
            {agent.prompt_preview || 'No prompt available'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {agent.instructions && (
          <div className="mb-3">
            <Label className="text-xs font-medium text-gray-600">Instructions:</Label>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {agent.instructions}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Settings className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-500">
            {agent.is_custom ? 'Custom Agent' : 'Built-in Agent'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Agent Editor Component
function AgentEditor({ agent, agentName, isCustom, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(agent?.name || agentName || '');
  const [displayName, setDisplayName] = useState(agent?.display_name || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [prompt, setPrompt] = useState(agent?.current_prompt || agent?.prompt || '');
  const [instructions, setInstructions] = useState(agent?.instructions || '');

  // Update instructions when agent changes
  useEffect(() => {
    if (agent?.instructions !== undefined) {
      setInstructions(agent.instructions);
    }
  }, [agent]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Agent name is required');
      return;
    }
    if (!displayName.trim()) {
      alert('Display name is required');
      return;
    }
    if (!prompt.trim()) {
      alert('Agent prompt is required');
      return;
    }
    
    onSave({
      id: agent?.id,
      name: name.trim(),
      display_name: displayName.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      instructions: instructions.trim(),
      is_custom: isCustom
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold">
          {agent ? 'Edit Agent' : 'Create New Agent'}
        </h3>
        <p className="text-sm text-gray-600">
          {isCustom ? 'Custom Agent' : 'Built-in Agent'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name (e.g., data_scientist)"
              className="mt-1"
              disabled={!isCustom} // Built-in agents can't change name
            />
            <p className="text-xs text-gray-500 mt-1">
              Unique identifier for the agent
            </p>
          </div>

          <div>
            <Label htmlFor="agent-display-name">Display Name</Label>
            <Input
              id="agent-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter display name (e.g., Data Scientist)"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Human-readable name for the agent
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="agent-description">Description</Label>
          <Textarea
            id="agent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter agent description"
            className="mt-1"
            rows={2}
          />
          <p className="text-xs text-gray-500 mt-1">
            Brief description of what this agent does
          </p>
        </div>

        <div>
          <Label htmlFor="agent-prompt">Agent Prompt</Label>
          <Textarea
            id="agent-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter the agent's prompt/role definition"
            className="mt-1"
            rows={8}
          />
          <p className="text-xs text-gray-500 mt-1">
            The main prompt that defines the agent's role and behavior
          </p>
        </div>

        <div>
          <Label htmlFor="agent-instructions">Specific Instructions</Label>
          <Textarea
            id="agent-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter specific instructions for this agent (optional)"
            className="mt-1"
            rows={4}
          />
          <p className="text-xs text-gray-500 mt-1">
            Additional instructions that will be passed to the agent during execution
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          {agent ? 'Update Agent' : 'Create Agent'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {agent && isCustom && (
          <Button variant="outline" onClick={() => onDelete(agent, agentName)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AgentManager() {
  const [agents, setAgents] = useState({});
  const [editingAgent, setEditingAgent] = useState(null);
  const [editingAgentName, setEditingAgentName] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isCustomAgent, setIsCustomAgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch agents on component mount
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/agents/prompts`);
      if (response.ok) {
        const data = await response.json();
        setAgents(data.agents || {});
      } else {
        console.error('Failed to fetch agents');
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCreateCustomAgent = () => {
    setEditingAgent(null);
    setEditingAgentName(null);
    setIsCustomAgent(true);
    setShowEditor(true);
  };

  const handleEditAgent = (agent, agentName) => {
    setEditingAgent(agent);
    setEditingAgentName(agentName);
    setIsCustomAgent(agent.is_custom || false);
    setShowEditor(true);
  };

  const handleCopyAgent = async (agent, agentName) => {
    if (agent.is_custom) {
      // Copy custom agent
      const newName = prompt('Enter name for the copied agent:', `${agent.name}_copy`);
      if (!newName) return;

      try {
        const response = await fetch(`${API_BASE_URL}/agents/custom/${agent.id}/copy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: newName }),
        });

        if (response.ok) {
          showNotification('Custom agent copied successfully', 'success');
          fetchAgents();
        } else {
          const error = await response.json();
          showNotification(`Error: ${error.error}`, 'error');
        }
      } catch (error) {
        showNotification('Network error occurred', 'error');
      }
    } else {
      // Copy built-in agent as custom
      const newName = prompt('Enter name for the copied agent:', `${agentName}_custom`);
      if (!newName) return;

      try {
        const response = await fetch(`${API_BASE_URL}/agents/custom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newName,
            display_name: `Copy of ${agent.display_name || agentName}`,
            description: agent.description || '',
            prompt: agent.current_prompt || '',
            instructions: agent.instructions || ''
          }),
        });

        if (response.ok) {
          showNotification('Agent copied as custom agent successfully', 'success');
          fetchAgents();
        } else {
          const error = await response.json();
          showNotification(`Error: ${error.error}`, 'error');
        }
      } catch (error) {
        showNotification('Network error occurred', 'error');
      }
    }
  };

  const handleDeleteAgent = async (agent, agentName) => {
    const agentDisplayName = agent.display_name || agentName;
    if (!confirm(`Are you sure you want to delete "${agentDisplayName}"?`)) return;

    if (agent.is_custom) {
      // Delete custom agent
      try {
        const response = await fetch(`${API_BASE_URL}/agents/custom/${agent.id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          showNotification('Custom agent deleted successfully', 'success');
          fetchAgents();
        } else {
          const error = await response.json();
          showNotification(`Error: ${error.error}`, 'error');
        }
      } catch (error) {
        showNotification('Network error occurred', 'error');
      }
    } else {
      // Reset built-in agent
      try {
        const response = await fetch(`${API_BASE_URL}/agents/prompts/${agentName}/reset`, {
          method: 'POST',
        });

        if (response.ok) {
          showNotification('Built-in agent reset to default', 'success');
          fetchAgents();
        } else {
          const error = await response.json();
          showNotification(`Error: ${error.error}`, 'error');
        }
      } catch (error) {
        showNotification('Network error occurred', 'error');
      }
    }
  };

  const handleResetAgent = async (agentName) => {
    if (!confirm(`Are you sure you want to reset "${agentName}" to default?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/agents/prompts/${agentName}/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        showNotification('Agent reset to default successfully', 'success');
        fetchAgents();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  const handleSaveAgent = async (agentData) => {
    try {
      if (agentData.is_custom) {
        // Save custom agent
        const url = agentData.id 
          ? `${API_BASE_URL}/agents/custom/${agentData.id}`
          : `${API_BASE_URL}/agents/custom`;
        
        const method = agentData.id ? 'PUT' : 'POST';

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(agentData),
        });

        if (response.ok) {
          showNotification(
            agentData.id ? 'Custom agent updated successfully' : 'Custom agent created successfully', 
            'success'
          );
          setShowEditor(false);
          setEditingAgent(null);
          setEditingAgentName(null);
          fetchAgents();
        } else {
          const error = await response.json();
          showNotification(`Error: ${error.error}`, 'error');
        }
      } else {
        // Update built-in agent prompt and instructions
        const updatePromises = [];
        
        // Update prompt
        updatePromises.push(
          fetch(`${API_BASE_URL}/agents/prompts/${agentData.name}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: agentData.prompt }),
          })
        );
        
        // Update instructions
        updatePromises.push(
          fetch(`${API_BASE_URL}/agents/instructions/${agentData.name}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ instructions: agentData.instructions }),
          })
        );
        
        const responses = await Promise.all(updatePromises);
        const allSuccessful = responses.every(response => response.ok);
        
        if (allSuccessful) {
          showNotification('Built-in agent updated successfully', 'success');
          setShowEditor(false);
          setEditingAgent(null);
          setEditingAgentName(null);
          fetchAgents();
        } else {
          const errors = await Promise.all(responses.map(r => r.json().catch(() => ({ error: 'Unknown error' }))));
          showNotification(`Error: ${errors[0].error}`, 'error');
        }
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  // Separate built-in and custom agents
  const builtInAgents = Object.entries(agents).filter(([name, agent]) => !agent.is_custom);
  const customAgents = Object.entries(agents).filter(([name, agent]) => agent.is_custom);

  // Apply search filter across both lists by name/display_name/description
  const normalizedQuery = (searchQuery || '').trim().toLowerCase();
  const matchesSearch = (name, agent) => {
    if (!normalizedQuery) return true;
    const display = (agent.display_name || '').toLowerCase();
    const desc = (agent.description || '').toLowerCase();
    return (
      (name || '').toLowerCase().includes(normalizedQuery) ||
      display.includes(normalizedQuery) ||
      desc.includes(normalizedQuery)
    );
  };
  const filteredBuiltInAgents = builtInAgents.filter(([name, agent]) => matchesSearch(name, agent));
  const filteredCustomAgents = customAgents.filter(([name, agent]) => matchesSearch(name, agent));

  if (showEditor) {
    return (
      <div className="space-y-6">
        <AgentEditor
          agent={editingAgent}
          agentName={editingAgentName}
          isCustom={isCustomAgent}
          onSave={handleSaveAgent}
          onCancel={() => {
            setShowEditor(false);
            setEditingAgent(null);
            setEditingAgentName(null);
          }}
          onDelete={handleDeleteAgent}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <Alert className={`${notification.type === 'error' ? 'border-red-500' : 
                                   notification.type === 'success' ? 'border-green-500' : 
                                   'border-blue-500'}`}>
          <AlertDescription>
            {notification.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent Management</h2>
          <p className="text-gray-600">Manage built-in and custom agents with their prompts and instructions</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search agents by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-72"
          />
          <Button onClick={handleCreateCustomAgent}>
            <Plus className="w-4 h-4 mr-2" />
            Add Custom Agent
          </Button>
        </div>
      </div>

      {/* Built-in Agents */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold">Built-in Agents</h3>
          <Badge variant="outline" className="text-xs">
            {filteredBuiltInAgents.length} agents
          </Badge>
        </div>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading agents...</p>
          </div>
        ) : (
          <>
            {filteredBuiltInAgents.length === 0 ? (
              <div className="text-center py-8 text-gray-600">No matching built-in agents</div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBuiltInAgents.map(([agentName, agent]) => (
                  <AgentCard
                    key={agentName}
                    agent={agent}
                    agentName={agentName}
                    onEdit={handleEditAgent}
                    onCopy={handleCopyAgent}
                    onDelete={handleDeleteAgent}
                    onReset={handleResetAgent}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Custom Agents */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Custom Agents</h3>
          <Badge variant="outline" className="text-xs">
            {filteredCustomAgents.length} agents
          </Badge>
        </div>
        
        {filteredCustomAgents.length === 0 ? (
          <div className="text-center py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">No matching custom agents.</p>
            {customAgents.length === 0 && (
              <Button onClick={handleCreateCustomAgent} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Custom Agent
              </Button>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCustomAgents.map(([agentName, agent]) => (
              <AgentCard
                key={agentName}
                agent={agent}
                agentName={agentName}
                onEdit={handleEditAgent}
                onCopy={handleCopyAgent}
                onDelete={handleDeleteAgent}
                onReset={handleResetAgent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
