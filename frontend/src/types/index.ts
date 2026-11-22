export interface DocumentItem {
  /** Row id in the backend's `documents` table */
  id: number;
  filename: string;
  upload_date: string | null;
  chunks_count: number;
  size: number;
  status: 'indexed' | 'uploaded_only' | 'indexed_no_file' | string;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  total: number;
}

export interface DocumentDeleteResponse {
  document_id: number;
  filename: string;
  deleted_from_minio: boolean;
  deleted_chunks_count: number;
  message: string;
}

export interface UploadResponse {
  document_id: number;
  filename: string;
  minio_bucket: string;
  chunks_indexed: number;
  status: string;
  message: string;
}

/** `detail` of a 415 Unsupported Media Type response from the upload endpoints */
export interface InvalidFileDetail {
  code: 'unsupported_extension' | 'empty_file' | 'content_mismatch' | 'corrupted_file' | string;
  message: string;
  detected_mime?: string | null;
}

export interface ChunkSource {
  content: string;
  similarity_score: number;
  file_name?: string | null;
  page?: number | null;
  chunk_index?: number | null;
  section?: string | null;
  metadata?: Record<string, unknown>;
}

export interface QueryRequest {
  question: string;
  top_k?: number;
  /** Ids from GET /documents to search in; omitted or empty = all documents */
  document_ids?: number[];
  /** Re-answer the last question: the backend drops the previous answer from the chat history first */
  regenerate?: boolean;
}

/** One NDJSON line from POST /query/stream */
export type QueryStreamEvent =
  | { type: 'sources'; sources: ChunkSource[] }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; detail: string };

export interface QueryResponse {
  question: string;
  answer: string;
  sources: ChunkSource[];
}

/** One message of the account's chat history, from GET /query/session */
export interface ServerChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  document_ids: number[] | null;
  target_files: string[];
  sources: ChunkSource[];
  /** generating = still being answered (possibly in another tab) */
  status: 'generating' | 'complete' | 'stopped' | 'error';
  error: string | null;
}

export interface ChatHistoryResponse {
  messages: ServerChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChunkSource[];
  timestamp: string;
  /** File names the question was scoped to; empty/missing = all documents */
  targetFiles?: string[];
  error?: boolean;
  /** True while tokens are still arriving */
  streaming?: boolean;
  /** The user stopped the generation; content is whatever had arrived by then */
  stopped?: boolean;
}

/** An account, from POST /auth/register and GET /auth/me */
export interface AuthUser {
  id: number;
  email: string;
  created_at: string;
}

/** POST /auth/login */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  /** seconds until the token expires */
  expires_in: number;
}
