import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Code, FileText, Settings, Users, MessageSquare, Plus, RotateCcw, Trash2, Zap, MessageCircle } from 'lucide-react';
import { getApiBaseUrl } from '../config/env';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  mode?: string;
  timestamp: Date;
  type: 'text' | 'code' | 'file' | 'error';
}

interface ChatSession {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
  lastActivity: Date;
}

interface AIChatbotProps {
  onRefreshFiles?: () => void
}

const AIChatbot: React.FC<AIChatbotProps> = ({ onRefreshFiles }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedMode, setSelectedMode] = useState<'ask' | 'agent'>('ask');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = getApiBaseUrl();

  useEffect(() => {
    fetchAvailableFiles();
    loadSessions();
    createNewSession();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load sessions from localStorage
  const loadSessions = () => {
    try {
      const savedSessions = localStorage.getItem('ai-chat-sessions');
      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        // Filter out expired sessions (older than 3 hours)
        const now = new Date();
        const validSessions = parsedSessions.filter((session: ChatSession) => {
          const sessionAge = now.getTime() - new Date(session.lastActivity).getTime();
          return sessionAge < 3 * 60 * 60 * 1000; // 3 hours in milliseconds
        });
        setSessions(validSessions);
        
        // If current session is expired, create a new one
        if (currentSessionId && !validSessions.find((s: ChatSession) => s.id === currentSessionId)) {
          createNewSession();
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  // Save sessions to localStorage
  const saveSessions = (newSessions: ChatSession[]) => {
    try {
      localStorage.setItem('ai-chat-sessions', JSON.stringify(newSessions));
    } catch (error) {
      console.error('Error saving sessions:', error);
    }
  };

  // Create a new chat session
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      name: `Chat ${sessions.length + 1}`,
      messages: [{
        id: '1',
        content: 'Hello! I\'m your AI coding assistant. I have two modes:\n\n🔍 **Ask Mode**: Simple chat with Gemini AI\n🤖 **Agent Mode**: Automatic execution (plan → review → create → debug → review)\n\nChoose your mode and start coding!',
        sender: 'ai',
        mode: 'system',
        timestamp: new Date(),
        type: 'text'
      }],
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    setSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
    setMessages(newSession.messages);
  };

  // Switch to a different session
  const switchSession = (sessionId: string) => {
    const session = sessions.find((s: ChatSession) => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      // Update last activity
      const updatedSessions = sessions.map((s: ChatSession) => 
        s.id === sessionId 
          ? { ...s, lastActivity: new Date() }
          : s
      );
      setSessions(updatedSessions);
      saveSessions(updatedSessions);
    }
  };

  // Delete a session
  const deleteSession = (sessionId: string) => {
    const updatedSessions = sessions.filter((s: ChatSession) => s.id !== sessionId);
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    
    // If we deleted the current session, create a new one
    if (currentSessionId === sessionId) {
      createNewSession();
    }
  };

  // Refresh current session
  const refreshSession = () => {
    const session = sessions.find((s: ChatSession) => s.id === currentSessionId);
    if (session) {
      setMessages(session.messages);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchAvailableFiles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/files`);
      const extractFilePaths = (node: any): string[] => {
        let paths: string[] = [];
        if (node.type === 'file') {
          paths.push(node.path);
        } else if (node.children) {
          node.children.forEach((child: any) => {
            paths.push(...extractFilePaths(child));
          });
        }
        return paths;
      };
      const filePaths = extractFilePaths(response.data);
      setAvailableFiles(filePaths);
      // Automatically select all files for context
      setSelectedFiles(filePaths);
    } catch (error) {
      console.error('Error fetching files:', error);
      // If backend is not available, show some default files
      const defaultFiles = ['main.py', 'app.js', 'index.html', 'style.css'];
      setAvailableFiles(defaultFiles);
      setSelectedFiles(defaultFiles);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    // Update session with new message
    const updatedSessions = sessions.map((s: ChatSession) => 
      s.id === currentSessionId 
        ? { ...s, messages: newMessages, lastActivity: new Date() }
        : s
    );
    setSessions(updatedSessions);
    saveSessions(updatedSessions);

    try {
      const response = await axios.post(`${API_BASE}/ai/chat`, {
        message: inputMessage,
        mode: selectedMode,
        file_paths: selectedFiles.length > 0 ? selectedFiles : undefined
      });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.data.response,
        sender: 'ai',
        mode: response.data.mode || 'ask',
        timestamp: new Date(),
        type: 'text'
      };

      const finalMessages = [...newMessages, aiMessage];
      setMessages(finalMessages);

      // Update session with AI response
      const finalUpdatedSessions = sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages: finalMessages, lastActivity: new Date() }
          : s
      );
      setSessions(finalUpdatedSessions);
      saveSessions(finalUpdatedSessions);

      // If agent mode created files, refresh the file explorer
      if (response.data.trigger_file_refresh || (response.data.mode === 'agent' && response.data.created_files)) {
        console.log('🔄 Refreshing files after agent execution...');
        fetchAvailableFiles();
        
        // Trigger file explorer refresh
        if (onRefreshFiles) {
          onRefreshFiles();
        }
        
        // Show notification about created files
        if (response.data.created_files && response.data.created_files.length > 0) {
          console.log('📁 Files created:', response.data.created_files);
        }
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Error: ${error.response?.data?.detail || error.message}`,
        sender: 'ai',
        mode: 'system',
        timestamp: new Date(),
        type: 'error'
      };
      const errorMessages = [...newMessages, errorMessage];
      setMessages(errorMessages);

      // Update session with error message
      const errorUpdatedSessions = sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages: errorMessages, lastActivity: new Date() }
          : s
      );
      setSessions(errorUpdatedSessions);
      saveSessions(errorUpdatedSessions);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'ask':
        return <MessageCircle className="w-4 h-4" />;
      case 'agent':
        return <Zap className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'ask':
        return 'bg-blue-500';
      case 'agent':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">AI Coding Assistant</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={createNewSession}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
              <span>New Chat</span>
            </button>
            <button
              onClick={refreshSession}
              className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              title="Refresh Chat"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
                          <button
                onClick={() => setSelectedMode(selectedMode === 'ask' ? 'agent' : 'ask')}
                className={`flex items-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedMode === 'ask' 
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                }`}
                title={`Current: ${selectedMode === 'ask' ? 'Ask Mode' : 'Agent Mode'}`}
              >
                {selectedMode === 'ask' ? <MessageCircle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                <span>{selectedMode === 'ask' ? 'Ask Mode' : 'Agent Mode'}</span>
              </button>
          </div>
        </div>
      </div>

      {/* Session Tabs */}
      {sessions.length > 1 && (
        <div className="bg-white border-b border-gray-200 p-3">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`flex items-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  currentSessionId === session.id
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="truncate max-w-24">{session.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                  className="text-gray-500 hover:text-red-600 transition-colors"
                  title="Delete Session"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File Selection */}
      <div className="bg-white border-b border-gray-200 p-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">Context Files:</span>
          <select
            multiple
            value={selectedFiles}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions, option => option.value);
              setSelectedFiles(values);
            }}
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">No files selected</option>
            {availableFiles.map((file) => (
              <option key={file} value={file}>{file}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
                              {message.sender === 'ai' && message.mode && (
                  <div className="flex items-center space-x-2 mb-2">
                    <div className={`p-1 rounded-full ${getModeColor(message.mode)}`}>
                      {getModeIcon(message.mode)}
                    </div>
                    <span className="text-xs font-medium text-gray-600">
                      {message.mode === 'ask' ? 'Ask Mode' : 'Agent Mode'}
                    </span>
                  </div>
                )}
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-2 ${
                message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
              }`}>
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex space-x-3">
          <div className="flex-1">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Ask ${selectedMode === 'ask' ? 'AI' : 'Agent'} anything about your code...`}
              className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              disabled={false}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};

export default AIChatbot;
