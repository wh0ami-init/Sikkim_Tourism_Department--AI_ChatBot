"""Tests for protected administrative operations."""
import pytest
from fastapi import HTTPException

from app import dependencies
from app.services.admin_auth import hash_password, verify_password
from app.services import admin_session
def test_sync_rejected_with_no_credentials(client):
    resp = client.post("/api/admin/sync")
    assert resp.status_code == 401


def test_sync_rejected_with_wrong_credentials(client):
    resp = client.post("/api/admin/sync", headers={"Authorization": "Basic definitely-wrong"})
    assert resp.status_code == 401


def test_sync_accepted_with_valid_password_credentials(client, admin_headers):
    resp = client.post("/api/admin/sync", headers=admin_headers)
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "ok"
    assert body["db_mode"] == "mysql"
    # GEMINI_API_KEY is empty in the test env, so populate_vectorstore()
    # short-circuits before indexing anything — that's expected here.
    assert body["indexed"] == 0


def test_password_verification_rejects_untrusted_scrypt_parameters():
    encoded = hash_password("SecurePassword123")
    assert not verify_password("SecurePassword123", encoded.replace("scrypt$16384", "scrypt$1048576"))


def test_admin_session_expires_server_side(monkeypatch):
    monkeypatch.setattr(admin_session.time, "time", lambda: 1_000)
    token = admin_session.issue_admin_session("tourism.admin")

    monkeypatch.setattr(
        admin_session.time,
        "time",
        lambda: 1_000 + admin_session.SESSION_MAX_AGE_SECONDS + 1,
    )

    assert admin_session.read_admin_session(token) is None


def test_dashboard_uses_the_repository_agency_count(client, admin_headers, repository, monkeypatch):
    async def count_travel_agencies(district=None):
        assert district is None
        return 1_856

    monkeypatch.setattr(repository, "count_travel_agencies", count_travel_agencies)
    response = client.get("/api/admin/dashboard", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["travel_agency_count"] == 1_856


@pytest.mark.asyncio
async def test_unknown_admin_username_uses_dummy_scrypt_hash(repository, monkeypatch):
    """A missing account must consume equivalent password-verification work."""
    observed_hashes: list[str] = []

    def capture_verify(_password: str, password_hash: str) -> bool:
        observed_hashes.append(password_hash)
        return False

    monkeypatch.setattr(dependencies, "verify_password", capture_verify)
    with pytest.raises(HTTPException, match="Invalid admin credentials"):
        await dependencies.verify_admin_credentials(
            authorization="Basic dW5rbm93bjp3cm9uZw==", repo=repository
        )

    assert observed_hashes == [dependencies._DUMMY_PASSWORD_HASH]
