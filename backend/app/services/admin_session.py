"""Short-lived, signed server-side admin browser sessions."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from app.config import settings

SESSION_COOKIE_NAME = "sikkim_admin_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(payload: str) -> str:
    return _encode(hmac.new(settings.admin_api_key.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())


def issue_admin_session(username: str) -> str:
    """Create a tamper-evident session token; the password is never included."""
    if not settings.admin_api_key:
        raise RuntimeError("ADMIN_API_KEY must be configured before issuing admin sessions.")
    now = int(time.time())
    payload = _encode(json.dumps({"u": username.lower(), "iat": now, "exp": now + SESSION_MAX_AGE_SECONDS}, separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_signature(payload)}"


def read_admin_session(token: str | None) -> str | None:
    """Return the signed-in username only for a valid, unexpired session."""
    if not isinstance(token, str) or not token or not settings.admin_api_key:
        return None
    payload, separator, supplied_signature = token.partition(".")
    if not separator or not hmac.compare_digest(_signature(payload), supplied_signature):
        return None
    try:
        data = json.loads(_decode(payload))
        username = data["u"]
        expires_at = data["exp"]
    except (KeyError, TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(username, str) or not username or not isinstance(expires_at, int) or expires_at < int(time.time()):
        return None
    return username
