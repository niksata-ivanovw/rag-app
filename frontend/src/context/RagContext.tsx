import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DocumentItem, ChatMessage } from '../types';
import { api } from '../api/client';
import { RagContext, type UploadResult } from './ragContextInstance';

const SESSION_KEY = 'rag_session_id';
const SELECTED_IDS_KEY = 'rag_selected_doc_ids';
const LEGACY_SELECTED_KEY = 'rag_selected_doc';

const loadSelectedIds = (): string[] => {
  try {
    const saved = localStorage.getItem(SELECTED_IDS_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    }
    // Migrate the old single-document selection
    const legacy = localStorage.getItem(LEGACY_SELECTED_KEY);
    if (legacy) {
      localStorage.removeItem(LEGACY_SELECTED_KEY);
      const doc = JSON.parse(legacy) as Partial<DocumentItem>;
      if (doc?.id) return [doc.id];
    }
  } catch {
    // corrupted storage: start with no selection
  }
  return [];
};

/** Drops selected ids whose documents no longer exist; keeps the same array if nothing changed. */
const pruneSelection = (ids: string[], docs: DocumentItem[]): string[] => {
  const existing = new Set(docs.map((d) => d.id));
  const kept = ids.filter((id) => existing.has(id));
  return kept.length === ids.length ? ids : kept;
};

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
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(loadSelectedIds);

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

  // Sync selection to localStorage
  useEffect(() => {
    localStorage.setItem(SELECTED_IDS_KEY, JSON.stringify(selectedDocumentIds));
  }, [selectedDocumentIds]);

  // Keep the order of the document list, not the order of clicking
  const selectedDocuments = useMemo(() => {
    const ids = new Set(selectedDocumentIds);
    return documents.filter((d) => ids.has(d.id));
  }, [documents, selectedDocumentIds]);

  // Sync messages to localStorage
  useEffect(() => {
    localStorage.setItem('rag_chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Fetch document list
  const fetchDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const response = await api.getDocuments();
      const docs = response.documents || [];
      setDocuments(docs);
      setSelectedDocumentIds((prev) => pruneSelection(prev, docs));
      setBackendOnline(true);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
      setBackendOnline(false);
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  // Initial load without calling setState directly in render phase
  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      try {
        const response = await api.getDocuments();
        if (active) {
          const docs = response.documents || [];
          setDocuments(docs);
          setSelectedDocumentIds((prev) => pruneSelection(prev, docs));
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
    setSelectedDocumentIds((prev) =>
      prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
    );
  };

  const clearDocumentSelection = () => setSelectedDocumentIds([]);

  const uploadDocument = async (file: File): Promise<UploadResult> => {
    try {
      const result = await api.uploadDocument(file);
      await fetchDocuments();
      return {
        success: true,
        message: result.message || `Файлът "${file.name}" беше качен и индексиран успешно (${result.chunks_indexed} чънка).`,
      };
    } catch (err: unknown) {
      let errorMsg = 'Грешка при качване на файла.';
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { status?: number; data?: { detail?: string } } };
        if (axErr.response?.status === 409) {
          return {
            success: false,
            duplicate: true,
            message: `Документ с име „${file.name}“ вече съществува. Изтрийте стария или преименувайте файла и опитайте отново.`,
          };
        }
        errorMsg = axErr.response?.data?.detail || errorMsg;
      }
      console.error('Upload error:', err);
      return { success: false, message: errorMsg };
    }
  };

  const deleteDocument = async (documentId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await api.deleteDocument(documentId);
      setSelectedDocumentIds((prev) => prev.filter((id) => id !== documentId));
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

    const documentIds = selectedDocuments.map((d) => d.id);
    const targetFiles = selectedDocuments.map((d) => d.filename);
    const assistantId = `assistant-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question.trim(),
      timestamp: nowTime(),
      targetFiles,
    };
    // Empty placeholder that fills up token by token
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: nowTime(),
      targetFiles,
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
          document_ids: documentIds.length > 0 ? documentIds : undefined,
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
        selectedDocumentIds,
        selectedDocuments,
        toggleSelectDocument,
        clearDocumentSelection,
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
