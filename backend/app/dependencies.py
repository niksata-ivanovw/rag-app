import psycopg2.pool
from fastapi import Request
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

from app.services.storage_service import MinioStorageService

DB_CONFIG = dict(
    dbname='rag_database',
    user='postgres',
    password='secret',
    host='127.0.0.1',
    port='5433'
)

class DatabasePool:
    def __init__(self):
        self.pool = psycopg2.pool.SimpleConnectionPool(minconn=1, maxconn=10, **DB_CONFIG)

    def get_connection(self):
        conn = self.pool.getconn()
        return conn

    def release_connection(self, conn):
        self.pool.putconn(conn)

    def close_all(self):
        self.pool.closeall()

def get_db_pool(request: Request) -> DatabasePool:
    return request.app.state.db_pool

def get_embed_model(request: Request) -> OllamaEmbedding:
    return request.app.state.embed_model

def get_llm_client(request: Request) -> Ollama:
    return request.app.state.llm_client

def get_storage_service(request: Request) -> MinioStorageService:
    return request.app.state.storage_service
