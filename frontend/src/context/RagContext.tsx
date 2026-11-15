import React, { useState, useEffect, useCallback } from 'react';
import type { DocumentItem, ChatMessage, ChunkSource } from '../types';
import { api } from '../api/client';
import { RagContext } from './ragContextInstance';

export const RagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(() => {
    const saved = localStorage.getItem('rag_selected_doc');
    return saved ? JSON.parse(saved) : null;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('rag_chat_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [isQuerying, setIsQuerying] = useState<boolean>(false);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);

  // Sync selectedDocument to localStorage
  useEffect(() => {
    if (selectedDocument) {
      localStorage.setItem('rag_selected_doc', JSON.stringify(selectedDocument));
    } else {
      localStorage.removeItem('rag_selected_doc');
    }
  }, [selectedDocument]);

  // Sync messages to localStorage
  useEffect(() => {
    localStorage.setItem('rag_chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Fetch document list
  const fetchDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const response = await api.getDocuments();
      setDocuments(response.documents || []);
      setBackendOnline(true);

      if (selectedDocument) {
        const stillExists = response.documents.some(
          (d) => d.id === selectedDocument.id || d.filename === selectedDocument.filename
        );
        if (!stillExists) {
          setSelectedDocument(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setBackendOnline(false);
    } finally {
      setLoadingDocuments(false);
    }
  }, [selectedDocument]);

  // Initial load without calling setState directly in render phase
  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      try {
        const response = await api.getDocuments();
        if (active) {
          setDocuments(response.documents || []);
          setBackendOnline(true);
        }
      } catch (err) {
        if (active) {
          console.error('Initial fetch failed:', err);
          setBackendOnline(false);
        }
      }
    };
    initialLoad();

    const interval = setInterval(async () => {
      try {
        await api.checkHealth();
        if (active) setBackendOnline(true);
      } catch {
        if (active) setBackendOnline(false);
      }
    }, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const toggleSelectDocument = (doc: DocumentItem) => {
    if (selectedDocument && (selectedDocument.id === doc.id || selectedDocument.filename === doc.filename)) {
      setSelectedDocument(null);
    } else {
      setSelectedDocument(doc);
    }
  };

  const uploadDocument = async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await api.uploadDocument(file);
      await fetchDocuments();
      return {
        success: true,
        message: result.message || `Файлът "${file.name}" беше качен и индексиран успешно (${result.chunks_indexed} чънка).`,
      };
    } catch (err: unknown) {
      console.error('Upload error:', err);
      let errorMsg = 'Грешка при качване на файла.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string } } };
        errorMsg = axErr.response?.data?.detail || errorMsg;
      }
      return { success: false, message: errorMsg };
    }
  };

  const deleteDocument = async (documentId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await api.deleteDocument(documentId);
      if (selectedDocument && (selectedDocument.id === documentId || selectedDocument.filename === documentId)) {
        setSelectedDocument(null);
      }
      await fetchDocuments();
      return {
        success: true,
        message: result.message || `Документът беше успешно изтрит от MinIO и pgvector.`,
      };
    } catch (err: unknown) {
      console.error('Delete error:', err);
      let errorMsg = 'Грешка при изтриване на документа.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string } } };
        errorMsg = axErr.response?.data?.detail || errorMsg;
      }
      return { success: false, message: errorMsg };
    }
  };

  const sendMessage = async (question: string) => {
    if (!question.trim() || isQuerying) return;

    const userMsgId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: question.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      targetFile: selectedDocument ? selectedDocument.filename : null,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsQuerying(true);

    try {
      const response = await api.query({
        question: question.trim(),
        top_k: 3,
        file_name: selectedDocument ? selectedDocument.filename : undefined,
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources as ChunkSource[],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        targetFile: selectedDocument ? selectedDocument.filename : null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      console.error('Query error:', err);
      let errorMsg = 'Възникна грешка при обработката на въпроса.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string } } };
        errorMsg = axErr.response?.data?.detail || errorMsg;
      }

      const errorMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
        error: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        targetFile: selectedDocument ? selectedDocument.filename : null,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsQuerying(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
    localStorage.removeItem('rag_chat_messages');
  };

  return (
    <RagContext.Provider
      value={{
        documents,
        loadingDocuments,
        selectedDocument,
        setSelectedDocument,
        toggleSelectDocument,
        fetchDocuments,
        uploadDocument,
        deleteDocument,
        messages,
        isQuerying,
        sendMessage,
        clearMessages,
        backendOnline,
      }}
    >
      {children}
    </RagContext.Provider>
  );
};
