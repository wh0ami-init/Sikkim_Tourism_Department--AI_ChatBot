"""
Shared FastAPI dependencies.

Currently just the admin-auth guard, but this is the right place to add
any other cross-cutting "check something before the route runs" logic
later (e.g. an internal-service auth check).
"""
from __future__ import annotations

import hmac
import base64

from fastapi import Depends, Header, HTTPException, status

from app.config import settings
from app.database.factory import get_repo
from app.services.admin_auth import hash_password, verify_password


# Run the same deliberately expensive scrypt operation for a nonexistent user
# as for a wrong password. Without this, response time reveals valid usernames.
_DUMMY_PASSWORD_HASH = hash_password("not-a-real-admin-password")


async def verify_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    """
    Guards internal/admin-only endpoints (currently just POST /api/admin/sync).

    Two deliberate design choices:

    1. FAILS CLOSED. If ADMIN_API_KEY isn't set in the environment, every
       request is rejected with 503 rather than let through. An unset
       secret must never be silently treated as "auth not required" —
       that's exactly how the endpoint ended up open in the first place.

    2. CONSTANT-TIME COMPARISON. Plain `==` on strings short-circuits at
       the first mismatched character, so response time can leak how many
       leading characters of a guess were correct. hmac.compare_digest
       always takes the same time regardless of where the strings diverge.

    Usage: add `dependencies=[Depends(verify_admin_key)]` to a router or
    route — FastAPI runs it before the handler and raises before any
    admin logic executes if it fails.
    """
    if not settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Admin endpoints are disabled: ADMIN_API_KEY is not "
                "configured on the server."
            ),
        )

    if not x_admin_key or not hmac.compare_digest(x_admin_key, settings.admin_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid setup credentials.",
        )


async def verify_admin_credentials(
        authorization: str | None = Header(default=None), repo=Depends(get_repo),
) -> str:
    """Authorize every admin request with the supplied username and password."""
    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials.",
        )
    try:
        decoded = base64.b64decode(authorization.removeprefix("Basic ").strip(), validate=True).decode("utf-8")
        username, separator, password = decoded.partition(":")
    except (ValueError, UnicodeDecodeError):
        username = separator = password = ""
    if not separator or not username or not password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials.",
        )
    user = await repo.get_admin_user(username.lower())
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    if not verify_password(password, password_hash) or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials.",
        )
    return user.username
