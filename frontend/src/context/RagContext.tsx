import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DocumentItem, ChatMessage } from '../types';
import { api } from '../api/client';
import { RagContext } from './ragContextInstance';

const SESSION_KEY = 'rag_session_id';

const newSessionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const loadSessionId = (): string => {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) return saved;
  const id = newSessionId();
  localStorage.setItem(SESSION_KEY, id);
  return id;
};

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const RagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(() => {
    const saved = localStorage.getItem('rag_selected_doc');
    return saved ? JSON.parse(saved) : null;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('rag_chat_messages');
    const parsed: ChatMessage[] = saved ? JSON.parse(saved) : [];
    // A reload mid-answer leaves a half-streamed message behind; mark it finished.
    return parsed.map((m) => (m.streaming ? { ...m, streaming: false } : m));
  });

  // Server-side conversation memory is keyed by this id
  const sessionIdRef = useRef<string>(loadSessionId());
  const abortRef = useRef<AbortController | null>(null);

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

    const targetFile = selectedDocument ? selectedDocument.filename : null;
    const assistantId = `assistant-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question.trim(),
      timestamp: nowTime(),
      targetFile,
    };
    // Empty placeholder that fills up token by token
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: nowTime(),
      targetFile,
      streaming: true,
    };

    const updateAssistant = (update: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? update(m) : m)));

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsQuerying(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.queryStream(
        {
          question: question.trim(),
          top_k: 3,
          file_name: targetFile ?? undefined,
          session_id: sessionIdRef.current,
        },
        (event) => {
          switch (event.type) {
            case 'sources':
              updateAssistant((m) => ({ ...m, sources: event.sources }));
              break;
            case 'token':
              updateAssistant((m) => ({ ...m, content: m.content + event.content }));
              break;
            case 'error':
              throw new Error(event.detail);
          }
        },
        controller.signal
      );
      updateAssistant((m) => ({ ...m, streaming: false }));
    } catch (err: unknown) {
      if (controller.signal.aborted) return; // chat was cleared mid-answer
      console.error('Query error:', err);
      const errorMsg = err instanceof Error && err.message ? err.message : 'Възникна грешка при обработката на въпроса.';
      updateAssistant((m) => ({
        ...m,
        // keep whatever was already streamed, then show the error
        content: m.content ? `${m.content}

⚠️ ${errorMsg}` : `⚠️ ${errorMsg}`,
        error: true,
        streaming: false,
      }));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsQuerying(false);
    }
  };

  const clearMessages = () => {
    abortRef.current?.abort();
    setMessages([]);
    localStorage.removeItem('rag_chat_messages');

    // Drop the server-side history and start a fresh conversation
    const oldSession = sessionIdRef.current;
    sessionIdRef.current = newSessionId();
    localStorage.setItem(SESSION_KEY, sessionIdRef.current);
    api.resetSession(oldSession).catch((err) => console.warn('Failed to reset chat session:', err));
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
