import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle, Clock, MoreVertical } from 'lucide-react';

// Backend URL configuration
const API_BASE_URL = 'http://157.66.191.31:5006/api';

function WorkflowSelector({ onWorkflowSelect, selectedWorkflow, agents }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

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

  const handleWorkflowSelect = (workflow) => {
    onWorkflowSelect(workflow);
    setShowSelector(false);
  };

  const normalizeSeq = (seq) => {
    if (Array.isArray(seq)) return seq;
    if (typeof seq === 'string') {
      try { return JSON.parse(seq); } catch { return []; }
    }
    return [];
  };

  const getSelectedWorkflowDisplay = () => {
    if (!selectedWorkflow) {
      const defaultWf = workflows.find(w => w.is_default);
      const count = defaultWf ? normalizeSeq(defaultWf.agent_sequence).length : 9;
      return {
        name: 'Default Workflow',
        description: 'Standard Adaptive System workflow with all agents',
        agentCount: count
      };
    }
    
    return {
      name: selectedWorkflow.name,
      description: selectedWorkflow.description || 'No description',
      agentCount: normalizeSeq(selectedWorkflow.agent_sequence).length || 0
    };
  };

  const display = getSelectedWorkflowDisplay();

  return (
    <div className="relative">
      {/* Workflow Display */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Selected Workflow
        </label>
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setShowSelector(!showSelector)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{display.name}</h4>
                  {selectedWorkflow?.is_default && (
                    <Badge variant="default" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {display.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {display.agentCount} agents
                  </Badge>
                  <span className="text-xs text-gray-500">
                    Click to change
                  </span>
                </div>
              </div>
              <MoreVertical className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Selector Dropdown */}
      {showSelector && (
        <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="p-4 border-b">
            <h3 className="font-medium">Choose a Workflow</h3>
            <p className="text-sm text-gray-600">Select the workflow for this task</p>
          </div>
          
          <div className="p-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Loading workflows...</p>
              </div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-600">No workflows available</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workflows.map((workflow) => (
                  <Card
                    key={workflow.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                      selectedWorkflow?.id === workflow.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => handleWorkflowSelect(workflow)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{workflow.name}</h4>
                            {workflow.is_default && (
                              <Badge variant="default" className="text-xs">
                                Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {workflow.description || 'No description'}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {normalizeSeq(workflow.agent_sequence).length || 0} agents
                            </Badge>
                            {Array.isArray(workflow.agent_models) && workflow.agent_models.filter(Boolean).length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {workflow.agent_models.filter(Boolean).length} model overrides
                              </Badge>
                            )}
                            <span className="text-xs text-gray-500">
                              {new Date(workflow.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {selectedWorkflow?.id === workflow.id && (
                          <CheckCircle className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showSelector && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowSelector(false)}
        />
      )}
    </div>
  );
}

export default WorkflowSelector;
