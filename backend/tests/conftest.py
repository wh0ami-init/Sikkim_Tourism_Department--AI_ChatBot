"""
Shared pytest fixtures.

IMPORTANT — env vars are set at MODULE level, before `main` (and therefore
`app.config.settings`) is ever imported. Settings() reads the environment
exactly once, at import time, so setting them inside a fixture would be too
late — the values below must exist before the first `import main` anywhere
in the test session.

These settings keep the whole suite fast and fully offline:
  - a test-only in-memory repository is injected -> no real MySQL connection
  - GEMINI_API_KEY=""  -> populate_vectorstore() short-circuits with just a
                          warning on startup instead of calling the real
                          Gemini embeddings API
  - GROQ_API_KEY=""    -> we simply don't exercise the code path that would
                          call the real Groq chat model (see test_chat.py)
"""
import os
import sys
from pathlib import Path

# `pytest` (unlike `python -m pytest`) does not add the current working
# directory to sys.path, so `from main import app` below would fail even
# though main.py sits right next to this tests/ folder. Add the backend/
# directory (this file's parent's parent) explicitly so it works no matter
# how pytest is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("GEMINI_API_KEY", "")
os.environ.setdefault("GROQ_API_KEY", "")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-for-pytest")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")

import pytest
from fastapi.testclient import TestClient

from app.database.factory import get_repo
from app.districts import normalize_district
from app.models.schemas import AdminUser, Conversation, Destination, DestinationWrite, Message, TravelAgency
from main import app


def _destination(id: int, name: str, category: str, district: str) -> Destination:
    slug = name.lower().replace(" ", "-")
    return Destination(
        id=id, name=name, slug=slug, category=category, district=district,
        description=f"Official test record for {name}.", location=district,
        best_time="March–May", how_to_reach="By road.", highlights=[], tags=[],
        image_placeholder="#888888",
    )


class TestRepository:
    """Small test double kept outside the production application package."""

    def __init__(self):
        self.admins: dict[str, AdminUser] = {}
        self.destinations = {
            row.id: row for row in (
                _destination(1, "Gangtok", "culture", "Gangtok"),
                _destination(2, "Yumthang", "nature", "Mangan"),
                _destination(3, "Teesta Rafting", "adventure", "Pakyong"),
                _destination(4, "Rumtek Monastery", "pilgrimage", "Gangtok"),
                _destination(5, "Khangchendzonga National Park", "wildlife", "Gyalshing"),
            )
        }
        self.conversations: dict[str, Conversation] = {}
        self.messages: list[Message] = []
        self.agencies: list[TravelAgency] = []

    async def admin_user_exists(self): return bool(self.admins)
    async def get_admin_user(self, username): return self.admins.get(username.lower())
    async def create_admin_user(self, user): self.admins[user.username.lower()] = user
    async def update_admin_password(self, username, password_hash):
        user = await self.get_admin_user(username)
        if not user: return False
        self.admins[username.lower()] = user.model_copy(update={"password_hash": password_hash})
        return True
    async def update_admin_credentials(self, username, new_username, password_hash):
        if new_username.lower() in self.admins and new_username.lower() != username.lower(): return False
        user = await self.get_admin_user(username)
        if not user: return False
        del self.admins[username.lower()]
        self.admins[new_username.lower()] = AdminUser(username=new_username.lower(), password_hash=password_hash)
        return True
    async def list_destinations(self, search=None, category=None):
        rows = list(self.destinations.values())
        if category: rows = [row for row in rows if row.category == category]
        if search:
            needle = search.lower()
            rows = [row for row in rows if needle in f"{row.name} {row.district} {row.description}".lower()]
        return rows
    async def get_destination(self, destination_id): return self.destinations.get(destination_id)
    async def create_destination(self, destination):
        if any(row.slug == destination.slug for row in self.destinations.values()): raise ValueError("duplicate slug")
        record = Destination(id=max(self.destinations, default=0) + 1, **destination.model_dump())
        self.destinations[record.id] = record
        return record
    async def update_destination(self, destination_id, destination):
        if destination_id not in self.destinations: return None
        if any(row.id != destination_id and row.slug == destination.slug for row in self.destinations.values()): raise ValueError("duplicate slug")
        record = Destination(id=destination_id, **destination.model_dump())
        self.destinations[record.id] = record
        return record
    async def delete_destination(self, destination_id): return self.destinations.pop(destination_id, None) is not None
    async def search_destinations_for_rag(self, query): return await self.list_destinations(search=query)
    async def create_conversation(self):
        conversation = Conversation()
        self.conversations[conversation.id] = conversation
        return conversation
    async def get_conversation(self, conversation_id): return self.conversations.get(conversation_id)
    async def add_message(self, conversation_id, role, content, client_message_id=None):
        message = Message(conversation_id=conversation_id, role=role, content=content, client_message_id=client_message_id)
        self.messages.append(message)
        return message
    async def get_message_by_client_id(self, conversation_id, client_message_id):
        return next((m for m in self.messages if m.conversation_id == conversation_id and m.client_message_id == client_message_id), None)
    async def list_messages(self, conversation_id): return [m for m in self.messages if m.conversation_id == conversation_id]
    async def list_circulars(self, category=None, limit=10): return []
    async def circular_exists(self, pdf_hash): return False
    async def save_circular(self, circular): return circular
    async def delete_circular(self, circular_id): return False
    async def list_travel_agencies(self, district=None, limit=100):
        rows = self.agencies if district is None else [a for a in self.agencies if normalize_district(a.district) == normalize_district(district)]
        return sorted(rows, key=lambda a: a.name.lower())[:limit]
    async def count_travel_agencies(self, district=None): return len(await self.list_travel_agencies(district, limit=10_000))
    async def search_travel_agencies(self, query, limit=5):
        needle = query.lower()
        return [a for a in self.agencies if needle in a.name.lower()][:limit]
    async def agency_exists(self, registration_number): return any(a.registration_number == registration_number for a in self.agencies)
    async def save_travel_agency(self, agency): self.agencies.append(agency); return agency


@pytest.fixture(scope="session")
def repository():
    return TestRepository()


@pytest.fixture(scope="session")
def client(repository):
    """
    TestClient used as a context manager so FastAPI's lifespan (startup /
    shutdown) actually runs, same as `python main.py` would — this is what
    triggers populate_vectorstore() once per test session.
    """
    import main
    main.get_repo = lambda: repository
    app.dependency_overrides[get_repo] = lambda: repository
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers(client):
    """Password credentials, matching the browser's per-request auth flow."""
    status = client.get("/api/admin/auth/status")
    if status.json()["setup_required"]:
        response = client.post(
            "/api/admin/auth/setup",
            json={"username": "pytest.admin", "password": "PytestAdminPass123"},
            headers={"X-Admin-Key": os.environ["ADMIN_API_KEY"]},
        )
    else:
        response = client.post(
            "/api/admin/auth/login",
            json={"username": "pytest.admin", "password": "PytestAdminPass123"},
        )
    assert response.status_code == 200
    import base64
    credentials = base64.b64encode(b"pytest.admin:PytestAdminPass123").decode("ascii")
    return {"Authorization": f"Basic {credentials}"}
