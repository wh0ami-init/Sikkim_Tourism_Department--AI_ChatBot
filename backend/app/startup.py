"""
|| Startup_Service || — populates the Qdrant vector store from MySQL every
time the server starts.

Flow:
  1. Fetch all destinations from the MySQL repository
  2. Convert each destination into a LangChain Document with rich metadata
  3. Embed via Gemini gemini-embedding-001 and upsert into Qdrant
  4. Log summary

Also exposes `resync_vectorstore()` for the /api/admin/sync endpoint so an
operator can trigger a live re-sync without a restart (useful when the MySQL
table is updated outside the app).
"""
from __future__ import annotations

import logging
import uuid
from asyncio import to_thread

from langchain_core.documents import Document

from app.config import settings
from app.database.base import BaseRepository
from app.models.schemas import Destination
from app.services.vectorstore import (
    clear_collection,
    existing_point_count,
    get_qdrant_client,
    get_vectorstore,
)

logger = logging.getLogger(__name__)


def _replace_vectorstore_snapshot(documents: list[Document]) -> None:
    """Perform blocking Qdrant and embedding work outside the event loop."""
    client = get_qdrant_client()
    # Make syncs authoritative: upserts alone retain records that were deleted
    # from the data source and let stale destinations leak into retrieval.
    clear_collection(client)

    vectorstore = get_vectorstore()
    ids = [str(uuid.uuid4()) for _ in documents]
    vectorstore.add_documents(documents=documents, ids=ids)

def _destination_to_document(dest: Destination) -> Document:
    """Build the text and metadata used for retrieval."""
    permit_text = ""
    if dest.permit_required and dest.permit_info:
        permit_text = f"\nPERMIT REQUIRED: {dest.permit_info}"

    page_content = (
        f"Destination: {dest.name}\n"
        f"Category: {dest.category}\n"
        f"District: {dest.district}, Sikkim\n"
        f"Altitude: {dest.altitude or 'N/A'}\n"
        f"Description: {dest.description}\n"
        f"Best time to visit: {dest.best_time}\n"
        f"Entry fee: {dest.entry_fee or 'Free'}"
        f"{permit_text}\n"
        f"How to reach: {dest.how_to_reach}\n"
        f"Highlights: {', '.join(dest.highlights)}\n"
        f"Tags: {', '.join(dest.tags)}"
    )

    metadata = {
        "id": dest.id,
        "name": dest.name,
        "slug": dest.slug,
        "category": dest.category,
        "district": dest.district,
        "permit_required": dest.permit_required,
        "best_time": dest.best_time,
        "entry_fee": dest.entry_fee or "Free",
        "tags": ",".join(dest.tags),
    }

    return Document(page_content=page_content, metadata=metadata)


async def populate_vectorstore(repo: BaseRepository, *, force: bool = False) -> int:
    """Populate Qdrant, reusing an existing remote snapshot when possible."""
    if not settings.gemini_api_key:
        logger.warning(
            "GEMINI_API_KEY is not set... — Skipping Vector Store Population. "
            "Set it in .env and restart to enable RAG."
        )
        return 0

    # In-memory Qdrant disappears whenever the process restarts, so it always
    # needs rebuilding. A remote collection persists and can be reused on
    # restart; operators explicitly request a fresh snapshot via admin sync.
    if settings.qdrant_url and not force:
        try:
            count = await to_thread(existing_point_count, get_qdrant_client())
            if count:
                logger.info(
                    "Vector store: reusing %d persisted points in '%s'.",
                    count,
                    settings.qdrant_collection,
                )
                return count
        except Exception as exc:
            logger.warning("Could not inspect existing Qdrant collection: %s", exc)

    logger.info(
        "Vector store: populating from %s (collection: %s, mode: %s)...",
        settings.db_mode,
        settings.qdrant_collection,
        settings.qdrant_mode,
    )

    destinations = await repo.list_destinations()
    if not destinations:
        error_msg = "CRITICAL: No destinations found in MySQL. Vector store will be EMPTY!"
        logger.error(error_msg)
        raise RuntimeError(error_msg + " Check MySQL connection and schema.")

    documents = [_destination_to_document(d) for d in destinations]

    # The Qdrant client and embedding SDK are synchronous. Running this work in
    # a worker thread keeps requests responsive while an admin-triggered re-sync
    # is embedding the complete destination catalog.
    await to_thread(_replace_vectorstore_snapshot, documents)

    logger.info(
        "Vector store: indexed %d destinations into '%s' (%s)",
        len(documents),
        settings.qdrant_collection,
        settings.qdrant_mode,
    )
    return len(documents)


async def resync_vectorstore(repo: BaseRepository) -> dict:

    count = await populate_vectorstore(repo, force=True)
    return {
        "status": "ok",
        "indexed": count,
        "db_mode": settings.db_mode,
        "qdrant_mode": settings.qdrant_mode,
        "collection": settings.qdrant_collection,
    }