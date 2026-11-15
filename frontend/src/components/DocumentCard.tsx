import React from 'react';
import { FileText, Trash2, Calendar, HardDrive, Layers, Check } from 'lucide-react';
import type { DocumentItem } from '../types';
import { useRag } from '../context/useRag';

interface DocumentCardProps {
  document: DocumentItem;
  onDeleteRequest: (document: DocumentItem) => void;
}

const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'Неизвестна дата';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('bg-BG', { year: 'numeric', month: 'short', day: 'numeric' });
};

const STATUS: Record<string, { label: string; tone: string }> = {
  indexed: { label: 'Индексиран', tone: 'ok' },
  uploaded_only: { label: 'Само в MinIO', tone: 'warn' },
};

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, onDeleteRequest }) => {
  const { selectedDocument, toggleSelectDocument } = useRag();
  const isSelected = selectedDocument?.id === document.id || selectedDocument?.filename === document.filename;
  const isPdf = document.filename.toLowerCase().endsWith('.pdf');
  const status = STATUS[document.status] ?? { label: 'Без файл в MinIO', tone: 'bad' };

  return (
    <article className={`doc-card ${isSelected ? 'selected' : ''}`}>
      <div className="doc-top">
        <div className={`doc-icon ${isPdf ? 'pdf' : 'docx'}`}>
          <FileText size={20} />
        </div>
        <button
          type="button"
          className="icon-btn icon-btn-danger"
          title={`Изтрий ${document.filename}`}
          aria-label={`Изтрий ${document.filename}`}
          onClick={() => onDeleteRequest(document)}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <h3 className="doc-name" title={document.filename}>{document.filename}</h3>

      <div className="doc-meta">
        <span><Calendar size={13} />{formatDate(document.upload_date)}</span>
        <span><HardDrive size={13} />{formatFileSize(document.size)}</span>
        <span><Layers size={13} />{document.chunks_count} чънка</span>
      </div>

      <div className="doc-bottom">
        <span className={`tag tag-${status.tone}`}>
          <span className="tag-dot" />
          {status.label}
        </span>
        <button
          type="button"
          className={`select-chip ${isSelected ? 'active' : ''}`}
          onClick={() => toggleSelectDocument(document)}
          title={isSelected ? 'Търси във всички документи' : 'Търси само в този файл'}
        >
          {isSelected && <Check size={14} />}
          {isSelected ? 'Избран за чата' : 'Използвай в чата'}
        </button>
      </div>
    </article>
  );
};
