"""
Vector store service — Qdrant + Google Gemini Embeddings via LangChain.

Default mode: fully in-memory (QdrantClient(":memory:")) — zero server/Docker setup.
macOS Big Sur (Intel x86_64) compatible: no fastembed, no torch, no local model.

To switch to persistent Qdrant:
  Set QDRANT_URL=http://localhost:6333  (local server)
  Set QDRANT_URL=https://xyz.cloud.qdrant.io  (Qdrant Cloud)
"""
from __future__ import annotations

import logging
from functools import lru_cache

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, Filter, FilterSelector, PointIdsList, VectorParams

from app.config import settings

logger = logging.getLogger(__name__)

# NOTE: Gemini embedding models do NOT all share the same vector size.
# "text-embedding-004" (retired by Google in late 2025) and the older
# "models/embedding-001" output 768 dims, while the current
# "models/gemini-embedding-001" defaults to 3072 dims (configurable).
# Hardcoding a dimension here caused every Qdrant upsert to fail silently
# (caught as "non-fatal" at startup), which left the vector store permanently
# empty — the real reason the bot always answered "I don't have knowledge."
# Instead, we detect the real dimension at runtime by embedding a probe string.
_embedding_dim_cache: int | None = None


@lru_cache(maxsize=1)
def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    """Singleton Google Gemini embeddings — reused across requests."""
    return GoogleGenerativeAIEmbeddings(
        model=settings.gemini_embedding_model,
        google_api_key=settings.gemini_api_key,
    )


def get_embedding_dimension() -> int:
    """
    Detect the real output dimension of the configured Gemini embedding model
    by embedding a short probe string. Cached for the life of the process.

    Raises RuntimeError early (rather than an obscure AttributeError deep
    inside the LangChain stack) when GEMINI_API_KEY is not configured.
    """
    global _embedding_dim_cache
    if _embedding_dim_cache is None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. "
                "Add it to backend/.env and restart the server to enable embeddings."
            )
        probe_vector = get_embeddings().embed_query("dimension probe")
        _embedding_dim_cache = len(probe_vector)
        logger.info(
            "Detected embedding dimension for '%s': %d",
            settings.gemini_embedding_model,
            _embedding_dim_cache,
        )
    return _embedding_dim_cache


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    """
    Singleton Qdrant client.

    - QDRANT_URL unset → in-memory (":memory:"), fastest for local dev
    - QDRANT_URL set   → remote/local server (persistent across restarts)
    """
    if settings.qdrant_url:
        logger.info("Qdrant: connecting to remote %s", settings.qdrant_url)
        kwargs: dict = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            kwargs["api_key"] = settings.qdrant_api_key
        return QdrantClient(**kwargs)
    else:
        logger.info("Qdrant: using in-memory store (no QDRANT_URL set)")
        return QdrantClient(":memory:")


def ensure_collection(client: QdrantClient) -> None:
    """
    Make sure the collection exists with the correct vector size.

    Only recreates the collection when it's missing or when its configured
    vector size doesn't match the current embedding model's real output
    dimension (e.g. after switching GEMINI_EMBEDDING_MODEL). Previously this
    unconditionally deleted + recreated the collection on every server start
    (and every /api/admin/sync call and every --reload cycle), which burned
    embedding-API quota and added startup latency for no reason.
    """
    dim = get_embedding_dimension()
    existing = {c.name for c in client.get_collections().collections}

    if settings.qdrant_collection in existing:
        info = client.get_collection(settings.qdrant_collection)
        current_size = info.config.params.vectors.size
        if current_size == dim:
            logger.info(
                "Collection '%s' already exists with matching vector size %d — reusing.",
                settings.qdrant_collection,
                dim,
            )
            return
        logger.warning(
            "Collection '%s' has vector size %d but embedding model produces %d — recreating.",
            settings.qdrant_collection,
            current_size,
            dim,
        )
        client.delete_collection(settings.qdrant_collection)

    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=VectorParams(
            size=dim,
            distance=Distance.COSINE,
        ),
    )

    logger.info(
        "Created collection '%s' with vector size %d",
        settings.qdrant_collection,
        dim,
    )


def existing_point_count(client: QdrantClient) -> int | None:
    """Return the persisted collection size, or ``None`` when it is absent.

    This intentionally does not initialise embeddings or create a collection.
    It lets startup reuse a healthy remote Qdrant snapshot without paying for
    another complete embedding pass after a web-service restart.
    """
    existing = {collection.name for collection in client.get_collections().collections}
    if settings.qdrant_collection not in existing:
        return None
    return client.count(settings.qdrant_collection, exact=False).count


def clear_collection(client: QdrantClient) -> None:
    """Remove every point from the active collection without recreating it.

    A sync must be a true snapshot of the source repository.  Merely upserting
    current records leaves points for destinations deleted from MySQL, causing
    the assistant to cite stale information.  Keeping the collection itself
    avoids another embedding-dimension probe and works for both local and
    remote Qdrant instances.
    """
    ensure_collection(client)
    client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=FilterSelector(filter=Filter(must=[])),
    )


def delete_points_except(client: QdrantClient, point_ids: set[str]) -> None:
    """Prune records absent from a completed snapshot without a blank interval.

    New documents are written before this function runs. If embedding or
    upserting fails, the previous snapshot remains retrievable instead of
    turning a transient provider failure into an empty RAG knowledge base.
    """
    offset = None
    stale_ids: list[str] = []
    while True:
        records, offset = client.scroll(
            collection_name=settings.qdrant_collection,
            limit=256,
            offset=offset,
            with_payload=False,
            with_vectors=False,
        )
        stale_ids.extend(str(record.id) for record in records if str(record.id) not in point_ids)
        if offset is None:
            break

    if stale_ids:
        client.delete(
            collection_name=settings.qdrant_collection,
            points_selector=PointIdsList(points=stale_ids),
        )

def get_vectorstore() -> QdrantVectorStore:
    """
    Return a ready-to-use LangChain QdrantVectorStore backed by Gemini embeddings.
    Call this after startup has populated the collection.
    """
    client = get_qdrant_client()
    embeddings = get_embeddings()
    return QdrantVectorStore(
        client=client,
        collection_name=settings.qdrant_collection,
        embedding=embeddings,
    )
