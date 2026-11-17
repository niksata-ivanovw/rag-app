import React from 'react';
import { User, Sparkles, AlertTriangle, FileText, CircleStop } from 'lucide-react';
import type { ChatMessage } from '../types';
import { SourceCollapsible } from './SourceCollapsible';
import ReactMarkDown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageItemProps {
  message: ChatMessage;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const waitingForFirstToken = message.streaming && !message.content;
  const scope = message.targetFiles ?? (message.targetFile ? [message.targetFile] : []);

  return (
    <div className={`msg ${isUser ? 'msg-user' : 'msg-ai'} ${message.error ? 'msg-error' : ''}`}>
      <div className={`msg-avatar ${isUser ? 'avatar-user' : 'avatar-ai'} ${message.streaming ? 'pulse' : ''}`}>
        {isUser ? <User size={17} /> : message.error ? <AlertTriangle size={17} /> : <Sparkles size={17} />}
      </div>

      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-author">{isUser ? 'Вие' : 'RAG Асистент'}</span>
          <span className="msg-time">{waitingForFirstToken ? 'Мисли…' : message.timestamp}</span>
          {isUser && scope.length > 0 && (
            <span className="msg-scope" title={`Търсено в: ${scope.join(', ')}`}>
              <FileText size={11} />
              {scope.length === 1 ? scope[0] : `${scope.length} документа`}
            </span>
          )}
          {message.stopped && (
            <span className="msg-stopped" title="Генерирането беше спряно от вас">
              <CircleStop size={11} />
              Спряно
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
          <div className="msg-bubble markdown">
            {message.stopped && !message.content ? (
              <p className="msg-stopped-empty">Генерирането беше спряно преди да започне отговорът.</p>
            ) : (
              <ReactMarkDown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkDown>
            )}
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
