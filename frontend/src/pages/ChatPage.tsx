import React, { useRef, useEffect } from 'react';
import { useRag } from '../context/useRag';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { ChatInput } from '../components/ChatInput';
import { ScopeSelector } from '../components/ScopeSelector';
import { Trash2, Sparkles, RotateCcw, ArrowUpRight } from 'lucide-react';

const SAMPLE_PROMPTS = [
  'Какво символизират ръцете и косата при Фотев?',
  'Кога е написана елегията на Дебелянов?',
  'Какви са основните мотиви и теми в текста?',
];

export const ChatPage: React.FC = () => {
  const { messages, isQuerying, clearMessages, sendMessage } = useRag();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  return (
    <section className="card chat-card">
      <div className="chat-head">
        <ScopeSelector />
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearMessages}>
            <Trash2 size={15} />
            <span>Изчисти чата</span>
          </button>
        )}
      </div>

      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-mark">
              <Sparkles size={28} />
            </div>
            <h2 className="welcome-title">Как мога да помогна днес?</h2>
            <p className="welcome-desc">
              Задайте въпрос и асистентът ще намери най-релевантните откъси от вашите документи и ще
              отговори с цитирани източници.
            </p>
            <div className="prompt-grid">
              {SAMPLE_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="prompt-card" onClick={() => sendMessage(prompt)}>
                  <span>{prompt}</span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-thread">
            {messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} />
            ))}

            {isQuerying && (
              <div className="msg msg-ai">
                <div className="msg-avatar avatar-ai pulse">
                  <Sparkles size={17} />
                </div>
                <div className="msg-body">
                  <div className="msg-meta">
                    <span className="msg-author">RAG Асистент</span>
                    <span className="msg-time">Мисли…</span>
                  </div>
                  <div className="msg-bubble typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="chat-foot">
        {lastIsAssistant && !isQuerying && (
          // Regenerate: placeholder, no functionality yet
          <button type="button" className="btn btn-outline btn-sm regenerate-btn">
            <RotateCcw size={15} />
            <span>Генерирай отново</span>
          </button>
        )}
        <ChatInput />
      </div>
    </section>
  );
};
