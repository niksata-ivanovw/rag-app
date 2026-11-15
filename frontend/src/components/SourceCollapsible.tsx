import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Bookmark, Percent } from 'lucide-react';
import type { ChunkSource } from '../types';

interface SourceCollapsibleProps {
  sources: ChunkSource[];
}

export const SourceCollapsible: React.FC<SourceCollapsibleProps> = ({ sources }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="source-collapsible">
      <button
        type="button"
        className="source-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="source-toggle-left">
          <Bookmark size={15} className="source-icon" />
          <span className="source-toggle-text">
            Използвани източници ({sources.length})
          </span>
          {/* Quick preview of filenames when collapsed */}
          {!isOpen && (
            <span className="source-files-summary">
              {Array.from(new Set(sources.map((s) => s.file_name || 'документ'))).join(', ')}
            </span>
          )}
        </div>
        <div className="source-toggle-right">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isOpen && (
        <div className="source-content-expanded">
          {sources.map((source, idx) => {
            const fileName = source.file_name || (source.metadata?.file_name as string) || 'Неизвестен файл';
            const page = source.page ?? (source.metadata?.page as number | undefined);
            const section = source.section || (source.metadata?.section as string | undefined);
            const chunkIdx = source.chunk_index ?? (source.metadata?.chunk_index as number | undefined);
            const scorePct = (source.similarity_score * 100).toFixed(1);

            return (
              <div key={idx} className="source-card">
                <div className="source-card-header">
                  <div className="source-doc-info">
                    <FileText size={14} className="source-doc-icon" />
                    <span className="source-doc-name" title={fileName}>
                      {fileName}
                    </span>
                    {page !== undefined && page !== null && (
                      <span className="source-tag page-tag">Стр. {page}</span>
                    )}
                    {chunkIdx !== undefined && chunkIdx !== null && (
                      <span className="source-tag chunk-tag">Чънк #{chunkIdx}</span>
                    )}
                  </div>

                  <div className="source-score-badge" title="Косинусно сходство на вектора с въпроса">
                    <Percent size={11} />
                    <span>{scorePct}% сходство</span>
                  </div>
                </div>

                {section && (
                  <div className="source-section-info">
                    <span className="section-label">Раздел:</span>
                    <span className="section-name" title={section}>
                      {section}
                    </span>
                  </div>
                )}

                <div className="source-excerpt">
                  <p>{source.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
