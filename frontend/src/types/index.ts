export interface DocumentItem {
  id: string;
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
  document_id: string;
  filename: string;
  deleted_from_minio: boolean;
  deleted_chunks_count: number;
  message: string;
}

export interface UploadResponse {
  filename: string;
  minio_bucket: string;
  chunks_indexed: number;
  status: string;
  message: string;
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
  file_name?: string | null;
  session_id?: string;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChunkSource[];
  timestamp: string;
  targetFile?: string | null;
  error?: boolean;
  /** True while tokens are still arriving */
  streaming?: boolean;
}
