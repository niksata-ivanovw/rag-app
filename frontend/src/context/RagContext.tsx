import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { DocumentItem, ChatMessage, InvalidFileDetail, ServerChatMessage } from '../types';
import { api, ApiError } from '../api/client';
import { RagContext, type UploadResult } from './ragContextInstance';

/** abort() reason that means "the user pressed Stop" (clearing the chat aborts without it) */
const STOP_REASON = 'user-stopped';
const SELECTED_IDS_KEY = 'rag_selected_doc_ids';
// Left over from older versions: the file-name based selection, the per-browser chat session id
// (the chat session is now the logged-in account) and the chat itself (now loaded from the server)
const LEGACY_KEYS = ['rag_selected_doc', 'rag_session_id', 'rag_chat_messages'];

const loadSelectedIds = (): number[] => {
  try {
    LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    const saved = localStorage.getItem(SELECTED_IDS_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      // ids used to be file names (strings); those are dropped here
      if (Array.isArray(parsed)) return parsed.filter((x): x is number => Number.isInteger(x));
    }
  } catch {
    // corrupted storage: start with no selection
  }
  return [];
};

/** Drops selected ids whose documents no longer exist; keeps the same array if nothing changed. */
const pruneSelection = (ids: number[], docs: DocumentItem[]): number[] => {
  const existing = new Set(docs.map((d) => d.id));
  const kept = ids.filter((id) => existing.has(id));
  return kept.length === ids.length ? ids : kept;
};

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/zip': 'ZIP архив',
  'application/msword': 'стар Word (.doc)',
};

/** Bulgarian text for a 415 response from the upload endpoint */
const invalidFileMessage = (fileName: string, detail?: InvalidFileDetail | string): string => {
  if (!detail || typeof detail === 'string') {
    return `Файлът „${fileName}“ не е валиден PDF или DOCX документ.`;
  }
  switch (detail.code) {
    case 'unsupported_extension':
      return `Неподдържан тип файл „${fileName}“. Поддържат се само .pdf и .docx.`;
    case 'empty_file':
      return `Файлът „${fileName}“ е празен.`;
    case 'content_mismatch': {
      const actual = detail.detected_mime
        ? `всъщност е ${MIME_LABELS[detail.detected_mime] ?? detail.detected_mime}`
        : 'съдържанието му не е разпознат формат';
      return `Файлът „${fileName}“ не е това, което подсказва разширението му – ${actual}.`;
    }
    case 'corrupted_file':
      return `Файлът „${fileName}“ не може да бъде отворен. Вероятно е повреден или защитен с парола.`;
    default:
      return detail.message || `Файлът „${fileName}“ не е валиден PDF или DOCX документ.`;
  }
};

// While another tab is generating an answer, check for it this often
const OTHER_TAB_POLL_MS = 3000;

const BUSY_MESSAGE =
  'В момента се генерира друг отговор за този акаунт (в друг раздел или прозорец). Изчакайте го да завърши или го спрете там.';

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString()} ${time}`;
};

const fromServer = (m: ServerChatMessage): ChatMessage => ({
  id: `msg-${m.id}`,
  role: m.role,
  content: m.status === 'error' && m.error ? (m.content ? `${m.content}\n\n⚠️ ${m.error}` : `⚠️ ${m.error}`) : m.content,
  timestamp: formatTimestamp(m.created_at),
  targetFiles: m.target_files,
  sources: m.sources,
  error: m.status === 'error',
  stopped: m.status === 'stopped',
  // being answered somewhere else; this tab shows it as in progress until it finishes
  streaming: m.status === 'generating',
});

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const RagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState<boolean>(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>(loadSelectedIds);

  // The account's conversation, loaded from the server (the same in every browser)
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  const [isQuerying, setIsQuerying] = useState<boolean>(false);

  // Logging out (or switching accounts) unmounts the provider: stop an answer still streaming
  useEffect(() => () => abortRef.current?.abort(), []);
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

  // Read by event listeners, which would otherwise see a stale value
  const isQueryingRef = useRef(false);
  useEffect(() => {
    isQueryingRef.current = isQuerying;
  }, [isQuerying]);

  /** Replaces the chat with the server's copy, unless this tab is streaming an answer right now */
  const loadHistory = useCallback(async () => {
    if (isQueryingRef.current) return;
    try {
      const { messages: stored } = await api.getChatHistory();
      if (!isQueryingRef.current) setMessages(stored.map(fromServer));
    } catch (err) {
      console.warn('Failed to load chat history:', err);
    }
  }, []);

  // Load on start, and again whenever the tab comes back into view: another browser or tab
  // may have asked something or cleared the chat in the meantime
  useEffect(() => {
    // deferred so the state update doesn't happen synchronously inside the effect
    const initial = setTimeout(loadHistory, 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadHistory();
    };
    window.addEventListener('focus', loadHistory);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(initial);
      window.removeEventListener('focus', loadHistory);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadHistory]);

  // An answer being generated in another tab: check back until it is done
  const answerInProgressElsewhere = !isQuerying && messages.some((m) => m.streaming);
  useEffect(() => {
    if (!answerInProgressElsewhere) return;
    const timer = setInterval(loadHistory, OTHER_TAB_POLL_MS);
    return () => clearInterval(timer);
  }, [answerInProgressElsewhere, loadHistory]);

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
        const axErr = err as { response?: { status?: number; data?: { detail?: string | InvalidFileDetail } } };
        if (axErr.response?.status === 415) {
          return { success: false, message: invalidFileMessage(file.name, axErr.response.data?.detail) };
        }
        if (axErr.response?.status === 409) {
          return {
            success: false,
            duplicate: true,
            message: `Документ с име „${file.name}“ вече съществува. Изтрийте стария или преименувайте файла и опитайте отново.`,
          };
        }
        const detail = axErr.response?.data?.detail;
        if (typeof detail === 'string' && detail) errorMsg = detail;
      }
      console.error('Upload error:', err);
      return { success: false, message: errorMsg };
    }
  };

  const deleteDocument = async (documentId: number): Promise<{ success: boolean; message: string }> => {
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

  /** Index of the last question in the chat, or -1 */
  const lastUserIndex = (list: ChatMessage[]): number => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'user') return i;
    return -1;
  };

  /** The last question sent, derived from the (persisted) chat so it survives reloads */
  const lastQuestion = useMemo(() => {
    const i = lastUserIndex(messages);
    return i >= 0 ? messages[i].content : null;
  }, [messages]);

  /**
   * Streams an answer into the assistant message `assistantId` (already in `messages`).
   * With `regenerate`, the backend first drops the previous answer to this question from its history.
   */
  const streamAnswer = async (question: string, assistantId: string, documentIds: number[], regenerate: boolean) => {
    const updateAssistant = (update: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? update(m) : m)));

    setIsQuerying(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.queryStream(
        {
          question,
          top_k: 3,
          document_ids: documentIds.length > 0 ? documentIds : undefined,
          regenerate: regenerate || undefined,
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
      if (controller.signal.aborted) {
        // Stop: keep the partial answer. Clear chat: the message is gone anyway.
        if (controller.signal.reason === STOP_REASON) {
          updateAssistant((m) => ({ ...m, streaming: false, stopped: true }));
        }
        return;
      }
      console.error('Query error:', err);
      const errorMsg =
        err instanceof ApiError && err.status === 409
          ? BUSY_MESSAGE
          : err instanceof Error && err.message
            ? err.message
            : 'Възникна грешка при обработката на въпроса.';
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

  /** Empty assistant message that fills up token by token */
  const newAssistantPlaceholder = (targetFiles: string[]): ChatMessage => ({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: '',
    timestamp: nowTime(),
    targetFiles,
    streaming: true,
  });

  const sendMessage = async (question: string) => {
    if (!question.trim() || isQuerying) return;

    const documentIds = selectedDocuments.map((d) => d.id);
    const targetFiles = selectedDocuments.map((d) => d.filename);
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question.trim(),
      timestamp: nowTime(),
      targetFiles,
    };
    const assistantMessage = newAssistantPlaceholder(targetFiles);

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    await streamAnswer(userMessage.content, assistantMessage.id, documentIds, false);
  };

  /** Asks the last question again and replaces its answer with a new one (uses the current document scope). */
  const regenerateLastAnswer = async () => {
    if (isQuerying || lastQuestion === null) return;

    const documentIds = selectedDocuments.map((d) => d.id);
    const targetFiles = selectedDocuments.map((d) => d.filename);
    const assistantMessage = newAssistantPlaceholder(targetFiles);

    setMessages((prev) => {
      const i = lastUserIndex(prev);
      if (i < 0) return prev;
      // keep the question (with the scope it is now asked in), drop the old answer after it
      return [...prev.slice(0, i), { ...prev[i], targetFiles }, assistantMessage];
    });
    await streamAnswer(lastQuestion, assistantMessage.id, documentIds, true);
  };

  // Aborting the fetch closes the connection; the backend notices and stops the LLM too
  const stopGeneration = () => abortRef.current?.abort(STOP_REASON);

  const clearMessages = () => {
    abortRef.current?.abort();
    setMessages([]);
    // Deletes the account's conversation; other open tabs show the empty chat once they are focused
    api.resetSession().catch((err) => console.warn('Failed to reset chat session:', err));
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
        lastQuestion,
        regenerateLastAnswer,
        stopGeneration,
        clearMessages,
        backendOnline,
      }}
    >
      {children}
    </RagContext.Provider>
  );
};
