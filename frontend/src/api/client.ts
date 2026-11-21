import axios from 'axios';
import type {
  DocumentListResponse,
  DocumentDeleteResponse,
  UploadResponse,
  QueryRequest,
  QueryResponse,
  QueryStreamEvent,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3 minutes timeout for LLM generation
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  async getDocuments(): Promise<DocumentListResponse> {
    const response = await apiClient.get<DocumentListResponse>('/documents');
    return response.data;
  },

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

  async deleteDocument(documentId: number): Promise<DocumentDeleteResponse> {
    const response = await apiClient.delete<DocumentDeleteResponse>(`/documents/${documentId}`);
    return response.data;
  },

  async query(request: QueryRequest): Promise<QueryResponse> {
    const response = await apiClient.post<QueryResponse>('/query', request);
    return response.data;
  },

  /**
   * Streams an answer from POST /query/stream (NDJSON) and calls onEvent for each line as it arrives.
   * Uses fetch because axios can't read a response body incrementally in the browser.
   */
  async queryStream(
    request: QueryRequest,
    onEvent: (event: QueryStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok || !response.body) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (typeof data?.detail === 'string') detail = data.detail;
      } catch {
        // body was not JSON
      }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const emit = (line: string) => {
      if (line.trim()) onEvent(JSON.parse(line) as QueryStreamEvent);
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the incomplete last line for the next chunk
      lines.forEach(emit);
    }
    emit(buffer + decoder.decode());
  },

  async resetSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/query/sessions/${encodeURIComponent(sessionId)}`);
  },

  async checkHealth(): Promise<{ status: string; app: string }> {
    const response = await apiClient.get<{ status: string; app: string }>('/health');
    return response.data;
  },
};

export default api;
