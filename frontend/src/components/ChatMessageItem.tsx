import React from 'react';
import { User, Sparkles, AlertTriangle, FileText } from 'lucide-react';
import type { ChatMessage } from '../types';
import { SourceCollapsible } from './SourceCollapsible';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const waitingForFirstToken = message.streaming && !message.content;

  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-ai'} ${message.error ? 'msg-error' : ''}`}>
      <div className={`msg-avatar ${isUser ? 'avatar-user' : 'avatar-ai'} ${message.streaming ? 'pulse' : ''}`}>
        {isUser ? <User size={17} /> : message.error ? <AlertTriangle size={17} /> : <Sparkles size={17} />}
      </div>

      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-author">{isUser ? 'Вие' : 'RAG Асистент'}</span>
          <span className="msg-time">{waitingForFirstToken ? 'Мисли…' : message.timestamp}</span>
          {isUser && message.targetFile && (
            <span className="msg-scope" title={`Търсено в: ${message.targetFile}`}>
              <FileText size={11} />
              {message.targetFile}
            </span>
          )}
        </div>

        {waitingForFirstToken ? (
          <div className="msg-bubble typing">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : (
          <div className="msg-bubble">
            {message.content}
            {message.streaming && <span className="stream-caret" aria-hidden="true" />}
          </div>
        )}

        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceCollapsible sources={message.sources} />
        )}
      </div>
    </div>
  );
};
