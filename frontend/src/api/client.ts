import axios from 'axios';
import { clearToken, getToken } from './authToken';
import type {
  DocumentListResponse,
  DocumentDeleteResponse,
  UploadResponse,
  QueryRequest,
  QueryResponse,
  QueryStreamEvent,
  ChatHistoryResponse,
  AuthUser,
  TokenResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/** HTTP error from a fetch-based call, keeping the status code (axios errors carry it already) */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3 minutes timeout for LLM generation
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Authorization header for the saved token (empty when logged out) */
const authHeader = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Every axios request carries the token
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// A 401 on a request that sent a token means it expired or the account is gone: log out.
// (The 401 of a wrong password on /auth/login is left to the login form.)
apiClient.interceptors.response.use(undefined, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.headers?.Authorization) {
    clearToken();
  }
  return Promise.reject(error);
});

export const api = {
  /** Exchanges email + password for a JWT (OAuth2 password form: the email goes in `username`) */
  async login(email: string, password: string): Promise<TokenResponse> {
    const form = new URLSearchParams({ username: email, password });
    const response = await apiClient.post<TokenResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  async register(email: string, password: string): Promise<AuthUser> {
    const response = await apiClient.post<AuthUser>('/auth/register', { email, password });
    return response.data;
  },

  /** The logged-in user; fails with 401 if the saved token is no longer valid */
  async me(): Promise<AuthUser> {
    const response = await apiClient.get<AuthUser>('/auth/me');
    return response.data;
  },

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
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(request),
      signal,
    });

    if (response.status === 401) clearToken();
    if (!response.ok || !response.body) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (typeof data?.detail === 'string') detail = data.detail;
      } catch {
        // body was not JSON
      }
      throw new ApiError(detail, response.status);
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

  /** The logged-in user's conversation, oldest first */
  async getChatHistory(): Promise<ChatHistoryResponse> {
    const response = await apiClient.get<ChatHistoryResponse>('/query/session');
    return response.data;
  },

  /** Clears the logged-in user's chat history on the server */
  async resetSession(): Promise<void> {
    await apiClient.delete('/query/session');
  },

  async checkHealth(): Promise<{ status: string; app: string }> {
    const response = await apiClient.get<{ status: string; app: string }>('/health');
    return response.data;
  },
};

export default api;
