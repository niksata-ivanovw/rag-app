import { createContext } from 'react';
import type { DocumentItem, ChatMessage } from '../types';

export interface RagContextType {
  documents: DocumentItem[];
  loadingDocuments: boolean;
  selectedDocument: DocumentItem | null;
  setSelectedDocument: (doc: DocumentItem | null) => void;
  toggleSelectDocument: (doc: DocumentItem) => void;
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
