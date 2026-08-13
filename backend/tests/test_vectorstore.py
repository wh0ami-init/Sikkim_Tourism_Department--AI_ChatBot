"""Offline regression tests for Qdrant collection maintenance."""

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
import pytest
from uuid import uuid4

from app.config import settings
from app import startup
from app.services import vectorstore


def test_clear_collection_removes_stale_points_without_recreating(monkeypatch):
    """A re-sync must not leave deleted source records retrievable."""
    client = QdrantClient(":memory:")
    original_collection = settings.qdrant_collection
    monkeypatch.setattr(settings, "qdrant_collection", "sync-regression-test")
    monkeypatch.setattr(vectorstore, "get_embedding_dimension", lambda: 2)

    try:
        vectorstore.ensure_collection(client)
        client.upsert(
            collection_name=settings.qdrant_collection,
            points=[PointStruct(id=1, vector=[1.0, 0.0], payload={"name": "Old place"})],
        )
        assert client.count(settings.qdrant_collection).count == 1

        vectorstore.clear_collection(client)
        assert client.count(settings.qdrant_collection).count == 0
    finally:
        settings.qdrant_collection = original_collection


def test_delete_points_except_prunes_only_records_missing_from_snapshot(monkeypatch):
    client = QdrantClient(":memory:")
    original_collection = settings.qdrant_collection
    monkeypatch.setattr(settings, "qdrant_collection", "snapshot-prune-test")
    monkeypatch.setattr(vectorstore, "get_embedding_dimension", lambda: 2)

    try:
        vectorstore.ensure_collection(client)
        current_id, stale_id = str(uuid4()), str(uuid4())
        client.upsert(
            collection_name=settings.qdrant_collection,
            points=[
                PointStruct(id=current_id, vector=[1.0, 0.0]),
                PointStruct(id=stale_id, vector=[0.0, 1.0]),
            ],
        )

        vectorstore.delete_points_except(client, {current_id})

        records, _ = client.scroll(settings.qdrant_collection, limit=10)
        assert [str(record.id) for record in records] == [current_id]
    finally:
        settings.qdrant_collection = original_collection


@pytest.mark.asyncio
async def test_remote_startup_reuses_nonempty_persisted_collection(monkeypatch):
    """A healthy remote collection must avoid a full re-embedding pass."""
    original_url = settings.qdrant_url
    monkeypatch.setattr(settings, "qdrant_url", "https://qdrant.example.test")
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(startup, "get_qdrant_client", lambda: object())
    monkeypatch.setattr(startup, "existing_point_count", lambda _client: 12)

    class Repo:
        async def list_destinations(self):
            raise AssertionError("source DB should not be read for a warm collection")

    try:
        assert await startup.populate_vectorstore(Repo()) == 12
    finally:
        settings.qdrant_url = original_url
