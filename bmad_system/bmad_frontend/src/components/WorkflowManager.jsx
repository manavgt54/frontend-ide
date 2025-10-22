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
  Plus, 
  Trash2, 
  GripVertical, 
  Edit, 
  Copy, 
  MoreVertical,
  Save,
  X,
  RotateCcw,
  CheckCircle,
  Clock,
  Maximize2
} from 'lucide-react';

// Backend URL configuration
const API_BASE_URL = 'http://157.66.191.31:5006/api';

// Sortable Workflow Item Component
function SortableWorkflowItem({ agentName, index, itemId, localAgents, onRemove, onEditHandoff, onOpenHandoffModal, modelValue, onChangeModel, availableModels, temperatureValue, onChangeTemperature, availableTemperatures }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-2 p-3 border rounded bg-background transition-colors sortable-item ${isDragging ? 'dragging' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span
          className="cursor-grab"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4 text-gray-400 grip-handle" />
        </span>
        <div className="flex-1">
          <div className="font-medium">
            {localAgents[agentName]?.display_name || agentName}
          </div>
          <div className="text-sm text-gray-600">
            Step {index + 1}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(index);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Handoff Prompt (optional)</Label>
            <Button
              size="icon"
              variant="ghost"
              title="Open large editor"
              onClick={() => onOpenHandoffModal(agentName)}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
          <Textarea
            rows={4}
            value={localAgents[agentName]?.handoff_prompt || ''}
            onChange={(e) => onEditHandoff(agentName, e.target.value)}
            placeholder="Enter handoff prompt text that will be prepended to this agent's prompt during execution"
          />
          <div className="text-xs text-gray-500">
            This text is saved per agent and applied in the default workflow execution.
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Model for this step</Label>
          <select
            className="w-full border rounded px-2 py-2 bg-background"
            value={modelValue || ''}
            onChange={(e) => onChangeModel(index, e.target.value || null)}
          >
            <option value="">Use default</option>
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            If set, this agent will run with the selected model.
          </div>
          <Label className="text-xs mt-2 block">Temperature for this step</Label>
          <select
            className="w-full border rounded px-2 py-2 bg-background"
            value={temperatureValue === null || temperatureValue === undefined ? '' : String(temperatureValue)}
            onChange={(e) => {
              const v = e.target.value;
              onChangeTemperature(index, v === '' ? null : parseFloat(v));
            }}
          >
            <option value="">Use default</option>
            {availableTemperatures.map((t) => (
              <option key={t.value} value={String(t.value)}>{t.label}</option>
            ))}
          </select>
          <div className="text-xs text-gray-500">
            Controls randomness: lower is deterministic, higher is creative.
          </div>
        </div>
      </div>
    </div>
  );
}

// Workflow Card Component
function WorkflowCard({ workflow, agents, onEdit, onCopy, onDelete, onSelect }) {
  const [showMenu, setShowMenu] = useState(false);
  const agentSeq = Array.isArray(workflow.agent_sequence)
    ? workflow.agent_sequence
    : (typeof workflow.agent_sequence === 'string'
        ? (() => { try { return JSON.parse(workflow.agent_sequence); } catch { return []; } })()
        : []);

  return (
    <Card className="relative hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{workflow.name}</CardTitle>
            <CardDescription className="mt-1">
              {workflow.description || 'No description'}
            </CardDescription>
            <div className="text-xs text-gray-500 font-mono mt-1">wf-id: {workflow.id}</div>
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
                    onEdit(workflow);
                    setShowMenu(false);
                  }}
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2"
                  onClick={() => {
                    onCopy(workflow);
                    setShowMenu(false);
                  }}
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center gap-2 text-red-600"
                  onClick={() => {
                    onDelete(workflow);
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
          {workflow.is_default && (
            <Badge variant="default" className="text-xs">
              Default
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {agentSeq.length} agents
          </Badge>
          <span className="text-xs text-gray-500">
            {new Date(workflow.created_at).toLocaleDateString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {agentSeq.slice(0, 3).map((agentName, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="text-gray-600">
                {agents[agentName]?.display_name || agentName}
              </span>
            </div>
          ))}
          {agentSeq.length > 3 && (
            <div className="text-xs text-gray-500">
              +{agentSeq.length - 3} more agents
            </div>
          )}
        </div>
        
      </CardContent>
    </Card>
  );
}

// Workflow Editor Component
function WorkflowEditor({ workflow, agents, onSave, onCancel, onDelete }) {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [agentSequence, setAgentSequence] = useState(workflow?.agent_sequence || []);
  const [agentModels, setAgentModels] = useState(workflow?.agent_models || Array((workflow?.agent_sequence || []).length).fill(null));
  const [agentTemperatures, setAgentTemperatures] = useState(workflow?.agent_temperatures || Array((workflow?.agent_sequence || []).length).fill(null));
  const [availableAgents, setAvailableAgents] = useState([]);
  const [localAgents, setLocalAgents] = useState(agents || {});
  const [savingHandoff, setSavingHandoff] = useState(false);
  const [availableSearch, setAvailableSearch] = useState('');
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [handoffModalAgent, setHandoffModalAgent] = useState(null);
  const [handoffModalText, setHandoffModalText] = useState('');

  const availableModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro'
  ];
  const availableTemperatures = [
    { value: 0.0, label: '0.0 — Most deterministic' },
    { value: 0.2, label: '0.2 — Focused' },
    { value: 0.5, label: '0.5 — Balanced' },
    { value: 0.7, label: '0.7 — Common default' },
    { value: 1.0, label: '1.0 — More diverse' },
    { value: 1.2, label: '1.2 — Very creative' },
    { value: 1.5, label: '1.5 — Very creative' },
    { value: 2.0, label: '2.0 — Max creative' },
  ];

  useEffect(() => {
    // Update local agents when props change
    setLocalAgents(agents || {});
  }, [agents]);

  useEffect(() => {
    // Available agents should include all to allow repeats
    const allAgents = Object.keys(localAgents);
    setAvailableAgents(allAgents);
  }, [agentSequence, localAgents]);

  useEffect(() => {
    if (!localAgents || Object.keys(localAgents).length === 0) {
      fetchAgents();
    }
  }, [localAgents]);

  // Keep agentModels aligned with agentSequence length
  useEffect(() => {
    setAgentModels((prev) => {
      const copy = Array.from(prev || []);
      if (copy.length < agentSequence.length) {
        return copy.concat(Array(agentSequence.length - copy.length).fill(null));
      }
      if (copy.length > agentSequence.length) {
        return copy.slice(0, agentSequence.length);
      }
      return copy;
    });
    setAgentTemperatures((prev) => {
      const copy = Array.from(prev || []);
      if (copy.length < agentSequence.length) {
        return copy.concat(Array(agentSequence.length - copy.length).fill(null));
      }
      if (copy.length > agentSequence.length) {
        return copy.slice(0, agentSequence.length);
      }
      return copy;
    });
  }, [agentSequence]);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/prompts`);
      if (response.ok) {
        const data = await response.json();
        setLocalAgents(data.agents || {});
      } else {
        console.error('Failed to fetch agents');
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const saveHandoffPrompt = async (agentName, text) => {
    try {
      setSavingHandoff(true);
      const resp = await fetch(`${API_BASE_URL}/agents/handoff/${agentName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handoff_prompt: text || '' })
      });
      setSavingHandoff(false);
      return resp.ok;
    } catch (e) {
      setSavingHandoff(false);
      return false;
    }
  };

  const handleEditHandoff = async (agentName, text) => {
    // Optimistically update local state
    setLocalAgents(prev => ({
      ...prev,
      [agentName]: { ...prev[agentName], handoff_prompt: text }
    }));
    // Persist to backend
    const ok = await saveHandoffPrompt(agentName, text);
    if (!ok) {
      console.error('Failed to save handoff prompt');
    }
  };

  const openHandoffModal = (agentName) => {
    const current = (localAgents[agentName]?.handoff_prompt) || '';
    setHandoffModalAgent(agentName);
    setHandoffModalText(current);
    setHandoffModalOpen(true);
  };

  const closeHandoffModal = () => {
    setHandoffModalOpen(false);
    setHandoffModalAgent(null);
    setHandoffModalText('');
  };

  const saveHandoffModal = async () => {
    if (!handoffModalAgent) return;
    const ok = await saveHandoffPrompt(handoffModalAgent, handoffModalText);
    if (ok) {
      setLocalAgents(prev => ({
        ...prev,
        [handoffModalAgent]: { ...prev[handoffModalAgent], handoff_prompt: handoffModalText }
      }));
      closeHandoffModal();
    } else {
      console.error('Failed to save handoff prompt');
    }
  };

  const addAgentToSequence = (agentName) => {
    setAgentSequence([...agentSequence, agentName]);
    setAgentModels((prev) => [...(prev || []), null]);
    setAgentTemperatures((prev) => [...(prev || []), null]);
  };

  const removeAgentFromSequence = (index) => {
    const newSequence = agentSequence.filter((_, i) => i !== index);
    setAgentSequence(newSequence);
    setAgentModels((prev) => (prev || []).filter((_, i) => i !== index));
    setAgentTemperatures((prev) => (prev || []).filter((_, i) => i !== index));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      setAgentSequence((items) => {
        const currentDnd = items.map((n, i) => `${n}::${i}`);
        const oldIndex = currentDnd.indexOf(active.id);
        const newIndex = currentDnd.indexOf(over.id);
        const moved = arrayMove(items, oldIndex, newIndex);
        // keep models aligned
        setAgentModels((prev) => arrayMove(prev, oldIndex, newIndex));
        setAgentTemperatures((prev) => arrayMove(prev, oldIndex, newIndex));
        return moved;
      });
    }
  };

  const handleChangeModel = (index, value) => {
    setAgentModels((prev) => {
      const next = Array.from(prev || []);
      next[index] = value || null;
      return next;
    });
  };

  const handleChangeTemperature = (index, value) => {
    setAgentTemperatures((prev) => {
      const next = Array.from(prev || []);
      next[index] = value;
      return next;
    });
  };

  // Unique DnD item IDs per position to allow duplicates
  const dndItems = agentSequence.map((name, idx) => `${name}::${idx}`);

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold">
          {workflow ? 'Edit Workflow' : 'Create New Workflow'}
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="workflow-name">Workflow Name</Label>
          <Input
            id="workflow-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter workflow name"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="workflow-description">Description</Label>
          <Textarea
            id="workflow-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter workflow description"
            className="mt-1"
            rows={3}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Available Agents */}
          <div className="space-y-4">
            <h4 className="font-medium">Available Agents</h4>
            <Input
              placeholder="Search agents..."
              value={availableSearch}
              onChange={(e) => setAvailableSearch(e.target.value)}
            />
            <div className="space-y-2">
              {availableAgents
                .filter((agentName) => {
                  const q = availableSearch.trim().toLowerCase();
                  if (!q) return true;
                  const meta = localAgents[agentName] || {};
                  const nameMatch = agentName.toLowerCase().includes(q);
                  const displayMatch = (meta.display_name || '').toLowerCase().includes(q);
                  const descMatch = (meta.description || '').toLowerCase().includes(q);
                  return nameMatch || displayMatch || descMatch;
                })
                .map((agentName) => (
                  <div key={agentName} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <div className="font-medium">{localAgents[agentName]?.display_name || agentName}</div>
                      <div className="text-sm text-gray-600">{localAgents[agentName]?.description}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addAgentToSequence(agentName)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              {availableAgents.length > 0 && availableAgents.filter((agentName) => {
                const q = availableSearch.trim().toLowerCase();
                if (!q) return false;
                const meta = localAgents[agentName] || {};
                const nameMatch = agentName.toLowerCase().includes(q);
                const displayMatch = (meta.display_name || '').toLowerCase().includes(q);
                const descMatch = (meta.description || '').toLowerCase().includes(q);
                return nameMatch || displayMatch || descMatch;
              }).length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  No matching agents
                </div>
              )}
            </div>
          </div>

          {/* Agent Sequence with Drag and Drop */}
          <div className="space-y-4">
            <h4 className="font-medium">Agent Sequence</h4>
            <DndContext
              sensors={useSensors(
                useSensor(PointerSensor),
                useSensor(KeyboardSensor, {
                  coordinateGetter: sortableKeyboardCoordinates,
                })
              )}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={dndItems}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {agentSequence.map((agentName, index) => (
                    <SortableWorkflowItem
                      key={dndItems[index]}
                      itemId={dndItems[index]}
                      agentName={agentName}
                      index={index}
                      localAgents={localAgents}
                      onRemove={removeAgentFromSequence}
                      onEditHandoff={handleEditHandoff}
                      onOpenHandoffModal={openHandoffModal}
                      modelValue={agentModels[index]}
                      onChangeModel={handleChangeModel}
                      availableModels={availableModels}
                      temperatureValue={agentTemperatures[index]}
                      onChangeTemperature={handleChangeTemperature}
                      availableTemperatures={availableTemperatures}
                    />
                  ))}
                  {agentSequence.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      No agents in sequence
                    </div>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onSave({ id: workflow?.id, name: name.trim(), description: description.trim(), agent_sequence: agentSequence, agent_models: agentModels, agent_temperatures: agentTemperatures })}>
          <Save className="w-4 h-4 mr-2" />
          {workflow ? 'Update Workflow' : 'Create Workflow'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {workflow && !workflow.is_default && (
          <Button variant="outline" onClick={() => onDelete(workflow)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
      </div>

      {/* Handoff Prompt Modal */}
      {handoffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeHandoffModal} />
          <div className="relative bg-background border rounded-lg shadow-xl w-full max-w-3xl mx-4">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h4 className="font-semibold">Edit Handoff Prompt</h4>
                <p className="text-xs text-gray-500 mt-1">Agent: <span className="font-mono">{handoffModalAgent}</span></p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeHandoffModal}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              <Label className="text-xs mb-2 block">Handoff Prompt</Label>
              <Textarea
                rows={18}
                value={handoffModalText}
                onChange={(e) => setHandoffModalText(e.target.value)}
                placeholder="Enter the full handoff instructions for this agent..."
              />
              <div className="text-xs text-gray-500 mt-2">
                This text will be prepended to the agent's base prompt during execution.
              </div>
            </div>
            <div className="p-4 border-t flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeHandoffModal}>Cancel</Button>
              <Button onClick={saveHandoffModal} disabled={savingHandoff}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowManager({ agents, onWorkflowSelect }) {
  const [workflows, setWorkflows] = useState([]);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Fetch workflows on component mount
  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/workflows`);
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data.workflows || []);
      } else {
        console.error('Failed to fetch workflows');
      }
    } catch (error) {
      console.error('Error fetching workflows:', error);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCreateWorkflow = () => {
    setEditingWorkflow(null);
    setShowEditor(true);
  };

  const handleEditWorkflow = (workflow) => {
    setEditingWorkflow(workflow);
    setShowEditor(true);
  };

  const handleCopyWorkflow = async (workflow) => {
    const newName = prompt('Enter name for the copied workflow:', `${workflow.name} (Copy)`);
    if (!newName) return;

    try {
      const response = await fetch(`${API_BASE_URL}/workflows/${workflow.id}/copy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });

      if (response.ok) {
        showNotification('Workflow copied successfully', 'success');
        fetchWorkflows();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  const handleDeleteWorkflow = async (workflow) => {
    if (!confirm(`Are you sure you want to delete "${workflow.name}"?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/workflows/${workflow.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showNotification('Workflow deleted successfully', 'success');
        fetchWorkflows();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  const handleSaveWorkflow = async (workflowData) => {
    try {
      const url = workflowData.id 
        ? `${API_BASE_URL}/workflows/${workflowData.id}`
        : `${API_BASE_URL}/workflows`;
      
      const method = workflowData.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(workflowData),
      });

      if (response.ok) {
        showNotification(
          workflowData.id ? 'Workflow updated successfully' : 'Workflow created successfully', 
          'success'
        );
        setShowEditor(false);
        setEditingWorkflow(null);
        fetchWorkflows();
      } else {
        const error = await response.json();
        showNotification(`Error: ${error.error}`, 'error');
      }
    } catch (error) {
      showNotification('Network error occurred', 'error');
    }
  };

  const onSave = (workflowData) => handleSaveWorkflow(workflowData);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Workflows</h2>
        <Button onClick={handleCreateWorkflow}>
          <Plus className="w-4 h-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {notification && (
        <Alert className={notification.type === 'error' ? 'border-red-500' : ''}>
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      {showEditor ? (
        <WorkflowEditor 
          workflow={editingWorkflow}
          agents={agents}
          onSave={onSave}
          onCancel={() => setShowEditor(false)}
          onDelete={handleDeleteWorkflow}
        />
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <div key={workflow.id} onClick={() => onWorkflowSelect && onWorkflowSelect(workflow)}>
              <WorkflowCard 
                workflow={workflow} 
                agents={agents}
                onEdit={handleEditWorkflow}
                onCopy={handleCopyWorkflow}
                onDelete={handleDeleteWorkflow}
                onSelect={onWorkflowSelect}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
