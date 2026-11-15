import React, { useState, useRef } from 'react';
import { Upload, FileUp, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { useRag } from '../context/useRag';

export const UploadSection: React.FC = () => {
  const { uploadDocument } = useRag();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateFile = (file: File): boolean => {
    const validExtensions = ['.pdf', '.docx'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) {
      setStatusMessage({
        type: 'error',
        text: `Невалиден формат. Поддържат се само .pdf и .docx файлове (избран файл: ${file.name}).`,
      });
      return false;
    }
    return true;
  };

  const processUpload = async (file: File) => {
    if (!validateFile(file)) return;

    setSelectedFile(file);
    setIsUploading(true);
    setStatusMessage(null);

    const result = await uploadDocument(file);

    setIsUploading(false);
    setSelectedFile(null);

    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: result.message,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else {
      setStatusMessage({
        type: 'error',
        text: result.message,
      });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processUpload(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processUpload(file);
    }
  };

  return (
    <div className="upload-container">
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="file-input-hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <div className="upload-icon-wrapper">
          {isUploading ? (
            <Loader2 className="spinner-icon upload-icon" size={36} />
          ) : (
            <Upload className="upload-icon" size={36} />
          )}
        </div>

        <div className="upload-texts">
          <h4 className="upload-title">
            {isUploading
              ? `Индексиране на ${selectedFile?.name || 'документ'}...`
              : 'Качи нов документ (PDF или DOCX)'}
          </h4>
          <p className="upload-subtitle">
            {isUploading
              ? 'Файлът се съхранява в MinIO и векторизира с bge-m3 в pgvector...'
              : 'Плъзнете файл или кликнете за избор от компютъра'}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary upload-btn"
          disabled={isUploading}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <FileUp size={16} />
          <span>{isUploading ? 'Обработва се...' : 'Избери файл'}</span>
        </button>
      </div>

      {/* Notification banner */}
      {statusMessage && (
        <div className={`upload-status-banner ${statusMessage.type}`}>
          <div className="status-content">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="status-icon" />
            ) : (
              <AlertCircle size={18} className="status-icon" />
            )}
            <span className="status-text">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            className="status-close-btn"
            onClick={() => setStatusMessage(null)}
            aria-label="Затвори съобщението"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
};
