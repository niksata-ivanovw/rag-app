import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  filename: string;
  message?: string;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  filename,
  message,
  isDeleting = false,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Handle Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="modal-backdrop"
      onClick={(e) => {
        // Light dismiss if clicked on backdrop
        if (e.target === dialogRef.current && !isDeleting) {
          onCancel();
        }
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-badge danger">
            <AlertTriangle size={24} />
          </div>
          <div className="modal-title-group">
            <h3 className="modal-title">{title}</h3>
            <p className="modal-filename">{filename}</p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Затвори"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-warning">
            {message ||
              'Сигурни ли сте, че искате да изтриете този документ? Файлът и неговите векторни ембединги ще бъде премахнати напълно от MinIO и pgvector.'}
          </p>
          <div className="modal-callout">
            <span>
              След изтриването, чат асистентът вече няма да има достъп до съдържанието на този документ.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Отказ
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="spinner-sm" />
                <span>Изтриване...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>Потвърди изтриването</span>
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
};
