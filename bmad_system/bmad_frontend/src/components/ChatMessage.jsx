import React from 'react';

const ChatMessage = ({ message, index }) => {
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getMessageType = (type) => {
    switch (type) {
      case 'user':
        return {
          avatar: 'U',
          avatarBg: 'bg-gradient-to-r from-blue-500 to-purple-600',
          bubbleClass: 'bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl rounded-br-sm',
          align: 'justify-end'
        };
      case 'assistant':
        return {
          avatar: 'A',
          avatarBg: 'bg-gray-600',
          bubbleClass: 'bg-gray-700 text-white rounded-2xl rounded-bl-sm',
          align: 'justify-start'
        };
      case 'system':
        return {
          avatar: 'S',
          avatarBg: 'bg-yellow-600',
          bubbleClass: 'bg-yellow-900/50 text-yellow-200 border border-yellow-500/30 rounded-xl',
          align: 'justify-start'
        };
      case 'error':
        return {
          avatar: 'E',
          avatarBg: 'bg-red-600',
          bubbleClass: 'bg-red-900/50 text-red-200 border border-red-500/30 rounded-xl',
          align: 'justify-start'
        };
      default:
        return {
          avatar: '?',
          avatarBg: 'bg-gray-600',
          bubbleClass: 'bg-gray-700 text-white rounded-2xl',
          align: 'justify-start'
        };
    }
  };

  const messageType = getMessageType(message.type);

  return (
    <div className={`message-enter flex ${messageType.align} mb-4`}>
      {message.type === 'user' ? (
        // User message (right-aligned)
        <div className="flex items-end space-x-2 max-w-[80%]">
          <div className="text-xs text-gray-400 mb-2">
            {formatTime(message.timestamp)}
          </div>
          <div className={`px-4 py-3 ${messageType.bubbleClass} shadow-lg`}>
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
          <div className={`w-8 h-8 ${messageType.avatarBg} rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg`}>
            {messageType.avatar}
          </div>
        </div>
      ) : (
        // Assistant/System/Error message (left-aligned)
        <div className="flex items-start space-x-3 max-w-[80%]">
          <div className={`w-8 h-8 ${messageType.avatarBg} rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg flex-shrink-0`}>
            {messageType.avatar}
          </div>
          <div className="flex-1">
            <div className={`px-4 py-3 ${messageType.bubbleClass} shadow-lg`}>
              <p className="text-sm leading-relaxed">{message.content}</p>
            </div>
            <div className="text-xs text-gray-400 mt-1 ml-1">
              {formatTime(message.timestamp)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessage; 