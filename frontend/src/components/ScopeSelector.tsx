import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileText, Files, Layers, X } from 'lucide-react';
import { useRag } from '../context/useRag';

/** Chooses which documents the RAG query searches in (none selected = all documents). */
export const ScopeSelector: React.FC = () => {
  const { selectedDocumentIds, selectedDocuments, toggleSelectDocument, clearDocumentSelection, documents } = useRag();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const count = selectedDocuments.length;
  const hasSelection = count > 0;
  const label =
    count === 0
      ? `Всички документи (${documents.length})`
      : count === 1
        ? selectedDocuments[0].filename
        : `${count} от ${documents.length} документа`;

  return (
    <div className="scope" ref={ref}>
      <button
        type="button"
        className={`scope-btn ${hasSelection ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title={hasSelection ? selectedDocuments.map((d) => d.filename).join('\n') : 'Обхват на търсене'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {count === 0 ? <Layers size={15} /> : count === 1 ? <FileText size={15} /> : <Files size={15} />}
        <span className="scope-label">{label}</span>
        <ChevronDown size={15} />
      </button>

      {hasSelection && (
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={clearDocumentSelection}
          title="Търси във всички документи"
          aria-label="Изчисти филтъра"
        >
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="scope-menu">
          <div className="scope-menu-head">
            <span>Търсене в</span>
            {hasSelection && (
              <button type="button" className="scope-clear" onClick={clearDocumentSelection}>
                Изчисти
              </button>
            )}
          </div>

          <label className={`scope-item ${!hasSelection ? 'selected' : ''}`}>
            <input
              type="checkbox"
              className="scope-check"
              checked={!hasSelection}
              disabled={!hasSelection}
              onChange={clearDocumentSelection}
            />
            <span className="scope-item-text">
              <span className="scope-item-title">Всички документи</span>
              <span className="scope-item-meta">Без филтър</span>
            </span>
          </label>

          {documents.length > 0 && <div className="scope-divider" />}

          {documents.map((doc) => {
            const checked = selectedDocumentIds.includes(doc.id);
            return (
              <label key={doc.id} className={`scope-item ${checked ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  className="scope-check"
                  checked={checked}
                  onChange={() => toggleSelectDocument(doc)}
                />
                <span className="scope-item-text">
                  <span className="scope-item-title" title={doc.filename}>{doc.filename}</span>
                  <span className="scope-item-meta">{doc.chunks_count} чънка</span>
                </span>
              </label>
            );
          })}

          {documents.length === 0 && <div className="scope-empty">Няма качени документи</div>}
        </div>
      )}
    </div>
  );
};
