import { createContext } from 'react';
import type { DocumentItem, ChatMessage } from '../types';

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
  uploadDocument: (file: File) => Promise<{ success: boolean; message: string }>;
  deleteDocument: (documentId: string) => Promise<{ success: boolean; message: string }>;
  messages: ChatMessage[];
  isQuerying: boolean;
  sendMessage: (question: string) => Promise<void>;
  clearMessages: () => void;
  backendOnline: boolean;
}

export const RagContext = createContext<RagContextType | undefined>(undefined);
