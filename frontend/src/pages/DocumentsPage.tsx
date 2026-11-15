import React, { useState } from 'react';
import { useRag } from '../context/useRag';
import { UploadSection } from '../components/UploadSection';
import { DocumentCard } from '../components/DocumentCard';
import { ConfirmModal } from '../components/ConfirmModal';
import { RefreshCw, FileText, Layers, CheckCircle2, Search, X } from 'lucide-react';
import type { DocumentItem } from '../types';

export const DocumentsPage: React.FC = () => {
  const { documents, loadingDocuments, fetchDocuments, deleteDocument } = useRag();

  const [documentToDelete, setDocumentToDelete] = useState<DocumentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    const result = await deleteDocument(documentToDelete.id || documentToDelete.filename);
    setIsDeleting(false);
    setDocumentToDelete(null);
    setActionNotice(result.message);
    setTimeout(() => setActionNotice(null), 5000);
  };

  const filteredDocs = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchFilter.toLowerCase())
  );
  const totalChunks = documents.reduce((acc, doc) => acc + (doc.chunks_count || 0), 0);
  const indexedCount = documents.filter((d) => d.status === 'indexed').length;

  const stats = [
    { icon: FileText, label: 'Документи', value: documents.length },
    { icon: Layers, label: 'Векторизирани чънка', value: totalChunks },
    { icon: CheckCircle2, label: 'Индексирани', value: indexedCount },
  ];

  return (
    <div className="docs-page">
      <div className="stat-row">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="card stat-tile">
            <span className="stat-icon"><Icon size={20} /></span>
            <div>
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Качване на документ</h2>
          </div>
        </div>
        <UploadSection />
      </section>

      {actionNotice && (
        <div className="notice notice-success">
          <CheckCircle2 size={18} />
          <span>{actionNotice}</span>
          <button type="button" className="icon-btn icon-btn-sm" onClick={() => setActionNotice(null)} aria-label="Затвори">
            <X size={15} />
          </button>
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Моите документи</h2>
            <p className="card-desc">{filteredDocs.length} от {documents.length}</p>
          </div>
          <div className="card-actions">
            <div className="search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Търси по име…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              {searchFilter && (
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => setSearchFilter('')} aria-label="Изчисти">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fetchDocuments()}
              disabled={loadingDocuments}
            >
              <RefreshCw size={16} className={loadingDocuments ? 'spin' : ''} />
              <span>Обнови</span>
            </button>
          </div>
        </div>

        {loadingDocuments && documents.length === 0 ? (
          <div className="empty">
            <RefreshCw size={28} className="spin" />
            <p>Зареждане на документите…</p>
          </div>
        ) : filteredDocs.length > 0 ? (
          <div className="doc-grid">
            {filteredDocs.map((doc) => (
              <DocumentCard key={doc.id || doc.filename} document={doc} onDeleteRequest={setDocumentToDelete} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <FileText size={36} />
            <h3>Няма намерени документи</h3>
            <p>
              {searchFilter
                ? `Няма резултати за „${searchFilter}“.`
                : 'Качете PDF или DOCX файл, за да започнете.'}
            </p>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={Boolean(documentToDelete)}
        title="Изтриване на документ"
        filename={documentToDelete?.filename || ''}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDocumentToDelete(null)}
      />
    </div>
  );
};
