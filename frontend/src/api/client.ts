import axios from 'axios';
import type {
  DocumentListResponse,
  DocumentDeleteResponse,
  UploadResponse,
  QueryRequest,
  QueryResponse,
} from '../types';

// Use environment variable or fallback to Vite proxy prefix
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3 minutes timeout for LLM generation
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  /**
   * Fetch all uploaded documents and their status/metadata
   */
  async getDocuments(): Promise<DocumentListResponse> {
    const response = await apiClient.get<DocumentListResponse>('/documents');
    return response.data;
  },

  /**
   * Upload a new document (.pdf or .docx)
   * Calls POST /documents
   */
  async uploadDocument(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UploadResponse>('/documents', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Delete document by ID/filename from both MinIO and pgvector
   * Calls DELETE /documents/{document_id}
   */
  async deleteDocument(documentId: string): Promise<DocumentDeleteResponse> {
    const encodedId = encodeURIComponent(documentId);
    const response = await apiClient.delete<DocumentDeleteResponse>(`/documents/${encodedId}`);
    return response.data;
  },

  /**
   * Query the local RAG pipeline with optional document filename filter
   * Calls POST /query
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await apiClient.post<QueryResponse>('/query', request);
    return response.data;
  },

  /**
   * Check backend health
   */
  async checkHealth(): Promise<{ status: string; app: string }> {
    const response = await apiClient.get<{ status: string; app: string }>('/health');
    return response.data;
  },
};

export default api;
