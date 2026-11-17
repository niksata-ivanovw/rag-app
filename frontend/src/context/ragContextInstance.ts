import { createContext } from 'react';
import type { DocumentItem, ChatMessage } from '../types';

export interface UploadResult {
  success: boolean;
  message: string;
  /** True when the backend refused the upload because the file already exists (HTTP 409) */
  duplicate?: boolean;
}

export interface RagContextType {
  documents: DocumentItem[];
  loadingDocuments: boolean;
  /** Ids of the documents the chat searches in; empty = all documents */
  selectedDocumentIds: string[];
  /** The selected ids resolved to documents (only ones that still exist) */
  selectedDocuments: DocumentItem[];
  toggleSelectDocument: (doc: DocumentItem) => void;
  clearDocumentSelection: () => void;
  fetchDocuments: () => Promise<void>;
  uploadDocument: (file: File) => Promise<UploadResult>;
  deleteDocument: (documentId: string) => Promise<{ success: boolean; message: string }>;
  messages: ChatMessage[];
  isQuerying: boolean;
  sendMessage: (question: string) => Promise<void>;
  /** The last question in the chat (null if none); what "Генерирай отново" re-asks */
  lastQuestion: string | null;
  regenerateLastAnswer: () => Promise<void>;
  /** Stops the answer that is being streamed (keeps the text received so far) */
  stopGeneration: () => void;
  clearMessages: () => void;
  backendOnline: boolean;
}

export const RagContext = createContext<RagContextType | undefined>(undefined);
