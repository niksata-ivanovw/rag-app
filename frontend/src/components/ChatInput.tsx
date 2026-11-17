import React, { useState, useRef, useEffect } from 'react';
import { SendHorizontal, Square } from 'lucide-react';
import { useRag } from '../context/useRag';

export const ChatInput: React.FC = () => {
  const { sendMessage, isQuerying, selectedDocuments, stopGeneration } = useRag();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isQuerying) return;
    const queryText = input.trim();
    setInput('');
    await sendMessage(queryText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="composer">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          selectedDocuments.length === 1
            ? `Задайте въпрос относно „${selectedDocuments[0].filename}“…`
            : selectedDocuments.length > 1
              ? `Задайте въпрос относно ${selectedDocuments.length} избрани документа…`
              : 'Задайте въпрос относно вашите документи…'
        }
        rows={1}
        disabled={isQuerying}
        className="composer-input"
      />
      {isQuerying ? (
        <button
          type="button"
          onClick={stopGeneration}
          className="composer-send composer-stop"
          title="Спри генерирането"
          aria-label="Спри генерирането"
        >
          <Square size={15} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          className="composer-send"
          title="Изпрати (Enter)"
          aria-label="Изпрати"
        >
          <SendHorizontal size={18} />
        </button>
      )}
    </form>
  );
};
