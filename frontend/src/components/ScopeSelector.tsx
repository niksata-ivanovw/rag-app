import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Layers, X, Check } from 'lucide-react';
import { useRag } from '../context/useRag';

/** Chooses which document(s) the RAG query searches in. */
export const ScopeSelector: React.FC = () => {
  const { selectedDocument, setSelectedDocument, documents } = useRag();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const isSelected = (id: string, filename: string) =>
    selectedDocument?.id === id || selectedDocument?.filename === filename;

  return (
    <div className="scope" ref={ref}>
      <button
        type="button"
        className={`scope-btn ${selectedDocument ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Обхват на търсене"
      >
        {selectedDocument ? <FileText size={15} /> : <Layers size={15} />}
        <span className="scope-label">
          {selectedDocument ? selectedDocument.filename : `Всички документи (${documents.length})`}
        </span>
        <ChevronDown size={15} />
      </button>

      {selectedDocument && (
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={() => setSelectedDocument(null)}
          title="Търси във всички документи"
          aria-label="Изчисти филтъра"
        >
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="scope-menu">
          <div className="scope-menu-head">Търсене в</div>
          <button
            type="button"
            className={`scope-item ${!selectedDocument ? 'selected' : ''}`}
            onClick={() => {
              setSelectedDocument(null);
              setOpen(false);
            }}
          >
            <span className="scope-item-text">
              <span className="scope-item-title">Всички документи</span>
              <span className="scope-item-meta">Целият pgvector индекс</span>
            </span>
            {!selectedDocument && <Check size={15} />}
          </button>

          {documents.length > 0 && <div className="scope-divider" />}

          {documents.map((doc) => (
            <button
              key={doc.id || doc.filename}
              type="button"
              className={`scope-item ${isSelected(doc.id, doc.filename) ? 'selected' : ''}`}
              onClick={() => {
                setSelectedDocument(doc);
                setOpen(false);
              }}
            >
              <span className="scope-item-text">
                <span className="scope-item-title" title={doc.filename}>{doc.filename}</span>
                <span className="scope-item-meta">{doc.chunks_count} чънка</span>
              </span>
              {isSelected(doc.id, doc.filename) && <Check size={15} />}
            </button>
          ))}

          {documents.length === 0 && <div className="scope-empty">Няма качени документи</div>}
        </div>
      )}
    </div>
  );
};
