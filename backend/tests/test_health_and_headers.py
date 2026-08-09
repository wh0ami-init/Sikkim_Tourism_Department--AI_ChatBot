"""
Tests for /api/health and the security headers that should be present on
every response (SecurityHeadersMiddleware in main.py).
"""

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services.circular_scraper import _is_allowed_url


def test_health_reports_configured_db_mode(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200

    body = resp.json()
    assert body["status"] == "ok"
    assert body["db_mode"] == "mysql"
    assert "qdrant_mode" in body
    # No real keys are set in the test environment (see conftest.py) —
    # the health check should honestly reflect that.
    assert body["embeddings_configured"] is False
    assert body["chat_llm_configured"] is False


def test_security_headers_present_on_every_response(client):
    resp = client.get("/api/health")

    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "DENY"
    assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors 'none'" in resp.headers["content-security-policy"]
    # HSTS is intentionally only added in production (see SecurityHeadersMiddleware)
    assert "strict-transport-security" not in resp.headers


def test_conversation_responses_are_not_cacheable(client):
    created = client.post("/api/conversations/")
    assert "no-store" in created.headers["cache-control"]


def test_public_destinations_are_cacheable(client):
    response = client.get("/api/destinations/")
    assert "s-maxage=3600" in response.headers["cache-control"]


def test_admin_cors_preflight_allows_existing_edit_and_delete_requests(client):
    response = client.options(
        "/api/admin/destinations/1",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
        },
    )
    assert response.status_code == 200
    assert "DELETE" in response.headers["access-control-allow-methods"]


def test_docs_csp_allows_only_the_assets_fastapi_docs_need(client):
    resp = client.get("/api/docs")

    assert resp.status_code == 200
    csp = resp.headers["content-security-policy"]
    assert "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net" in csp
    assert "connect-src 'self'" in csp


def test_oversized_admin_upload_is_rejected_before_multipart_parsing(client, monkeypatch):
    """The early guard prevents file spooling before authentication/handling."""
    from app.config import settings

    monkeypatch.setattr(settings, "max_admin_upload_request_bytes", 1)
    response = client.post(
        "/api/admin/upload-circular",
        content=b"xx",
        headers={"Content-Length": "2", "Content-Type": "multipart/form-data"},
    )
    assert response.status_code == 413
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "no-store" in response.headers["cache-control"]


def test_scraper_allowlist_rejects_credentials_and_nonstandard_ports():
    assert _is_allowed_url("https://sikkimtourism.gov.in/updates/notice")
    assert not _is_allowed_url("https://sikkimtourism.gov.in:8443/private")
    assert not _is_allowed_url("https://user@sikkimtourism.gov.in/private")


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS"):
        Settings(environment="production", allowed_origins="*")


def test_production_rejects_whitespace_padded_wildcard_cors():
    with pytest.raises(ValidationError, match="ALLOWED_ORIGINS"):
        Settings(environment=" Production ", allowed_origins=" * ")


def test_environment_is_normalised_before_security_checks():
    settings = Settings(environment=" Production ", allowed_origins="https://example.com ")
    assert settings.environment == "production"
    assert settings.origins_list == ["https://example.com"]


def test_circular_scraper_is_locked_to_the_official_tourism_domain():
    with pytest.raises(ValidationError, match="CIRCULARS_ALLOWED_HOST"):
        Settings(circulars_allowed_host="www.sikkim.gov.in")

    with pytest.raises(ValidationError, match="CIRCULARS_NOTICE_URL"):
        Settings(circulars_notice_url="https://www.sikkim.gov.in/notices")
