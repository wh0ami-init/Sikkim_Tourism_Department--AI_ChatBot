"""
Pydantic models shared across the entire application.

All datetime fields use timezone-aware UTC timestamps (datetime.now(timezone.utc))
rather than the deprecated datetime.utcnow(), which returns a naive datetime and
causes DeprecationWarnings on Python 3.12+.
"""
from __future__ import annotations

import re
import unicodedata
from base64 import b64decode
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator


class AdminUser(BaseModel):
    username: str
    password_hash: str


class AdminCredentials(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=128)


class AdminPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)


class AdminCredentialsChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    new_password: str = Field(min_length=1, max_length=128)


# ── Destination ──────────────────────────────────────────────────────────

class Destination(BaseModel):
    """Full destination record — returned by GET /api/destinations/{id}."""

    id: int
    name: str
    slug: str
    category: Literal["nature", "culture", "adventure", "pilgrimage", "wildlife"]
    description: str
    location: str
    district: str
    altitude: str | None = None
    best_time: str
    entry_fee: str | None = None
    permit_required: bool = False
    permit_info: str | None = None
    how_to_reach: str
    highlights: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    image_placeholder: str = ""
    # Relative URL (e.g. /images/Gangtok.png) or colour hex used as CSS
    # background fallback when no image is available.
    image_url: str | None = None
    # Geographic coordinates — used by the frontend to fetch live weather
    # from Open-Meteo (free, no API key required).
    latitude: float | None = None
    longitude: float | None = None


class DestinationWrite(BaseModel):
    """Admin-managed destination fields, without a database-assigned ID."""

    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=200, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    category: Literal["nature", "culture", "adventure", "pilgrimage", "wildlife"]
    description: str = Field(min_length=1, max_length=20_000)
    location: str = Field(min_length=1, max_length=300)
    district: str = Field(min_length=1, max_length=100)
    altitude: str | None = Field(default=None, max_length=100)
    best_time: str = Field(min_length=1, max_length=200)
    entry_fee: str | None = Field(default=None, max_length=100)
    permit_required: bool = False
    permit_info: str | None = Field(default=None, max_length=5_000)
    how_to_reach: str = Field(min_length=1, max_length=10_000)
    highlights: list[str] = Field(default_factory=list, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=50)
    image_placeholder: str = Field(default="#888888", max_length=20)
    image_url: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("image_placeholder")
    @classmethod
    def validate_image_placeholder(cls, value: str) -> str:
        """Allow only six-digit hex colours in inline card styles."""
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("image_placeholder must be a six-digit hex colour.")
        return value.lower()

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        """Permit only local destination images covered by the frontend CSP."""
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if re.fullmatch(r"/images/[A-Za-z0-9][A-Za-z0-9._-]*", value):
            return value
        raise ValueError("image_url must be a local /images/ filename.")


class DestinationSummary(BaseModel):
    """Lightweight card payload used in list / search views."""

    id: int
    name: str
    slug: str
    category: str
    district: str
    best_time: str
    permit_required: bool
    tags: list[str]
    image_placeholder: str
    image_url: str | None = None
    # Truncated to 160 chars by the router for list views
    description: str
    # Geographic coordinates forwarded from the full Destination record
    latitude: float | None = None
    longitude: float | None = None


# ── Circular ─────────────────────────────────────────────────────────────

class Circular(BaseModel):
    """
    An official notice/circular ingested from the department's website
    (road status reports, cancellation orders, general notices).

    Populated by the background scraper (app/services/circular_scraper.py),
    never written directly by user-facing requests.
    """

    # None until save_circular() persists it and assigns the real primary key
    # (auto-increment in MySQL).
    id: int | None = None
    title: str
    category: Literal["road_status", "cancellation_order", "notice"]
    district: str | None = None
    issue_date: str  # ISO date string (YYYY-MM-DD) — kept as str to avoid
    # timezone edge cases when round-tripping through JSON/MySQL DATE columns.
    source_url: str
    pdf_hash: str  # sha256 of the PDF bytes — used to skip already-ingested files
    extracted_text: str
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AdvisorySummary(BaseModel):
    """Public, minimal view of a time-sensitive official advisory.

    Deliberately excludes the full OCR text, file hash, and ingestion metadata
    used by administrative workflows.
    """

    id: int
    title: str
    category: Literal["road_status", "cancellation_order", "notice"]
    district: str | None = None
    issue_date: str
    source_url: str


# ── Travel Agency ────────────────────────────────────────────────────────

class TravelAgency(BaseModel):
    """
    A registered Sikkim travel agency, synced from the department's public
    district-wise JSON directory (see app/services/travel_agency_scraper.py).

    All fields except name/registration_number are nullable — the source
    JSON files are inconsistent (many records omit district, contact is
    sometimes spelled "conatct" in the source, a few rows are placeholders).
    """

    # None until save_travel_agency() persists it and assigns the real
    # primary key (auto-increment in MySQL).
    id: int | None = None
    name: str
    registration_number: str
    proprietor: str | None = None
    address: str | None = None
    district: str | None = None
    grade: str | None = None
    contact: str | None = None
    email_or_website: str | None = None
    date_of_issue: str | None = None
    renewed_upto: str | None = None
    synced_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Conversation ──────────────────────────────────────────────────────────

class Conversation(BaseModel):
    """A chat session container.  Created by POST /api/conversations/."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    # Use timezone-aware UTC — datetime.utcnow() is deprecated in Python 3.12+
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Message(BaseModel):
    """A single turn in a conversation (user or assistant)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    client_message_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Request / Response bodies ──────────────────────────────────────────────────

# Allowed MIME types for image uploads — whitelist only.
_ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

# Max base64 length accepted (~4 MB binary → ~5.5 MB base64).
_MAX_IMAGE_BASE64_LEN = 5_600_000


class ChatRequest(BaseModel):
    """Body for POST /api/conversations/{id}/chat.

    image_base64 / image_mime_type are optional.  When supplied the backend
    routes the turn through Gemini Vision instead of the Groq text chain so
    the AI can analyse the image and answer about it in a Sikkim context.
    """

    message: str = Field(..., min_length=1, max_length=2000)
    client_message_id: str | None = Field(default=None, max_length=64)

    # ── Optional image attachment ──────────────────────────────────────────
    # Raw base64-encoded image bytes (no data-URI prefix — strip it on the
    # frontend before sending to keep the payload clean and avoid surprises
    # when the backend validates length).
    image_base64: str | None = Field(default=None, max_length=_MAX_IMAGE_BASE64_LEN)
    image_mime_type: str | None = Field(default=None)

    @field_validator("message", mode="before")
    @classmethod
    def sanitize_message(cls, v: object) -> object:
        """Sanitize user message to prevent injection attacks.

        Runs in mode="before" — i.e. BEFORE Pydantic checks min_length/
        max_length — so a message of pure whitespace gets stripped down
        to "" first and then correctly fails min_length=1. Previously
        this validator ran "after" the length check, so "   " (length 3)
        passed validation and only became empty afterward, silently
        bypassing the empty-message guard.
        """
        if not isinstance(v, str):
            return v  # let Pydantic's normal type validation raise the error

        # Strip leading/trailing whitespace
        v = v.strip()

        # Normalize Unicode (NFKC) to prevent homograph attacks
        v = unicodedata.normalize("NFKC", v)

        return v

    @field_validator("image_mime_type", mode="before")
    @classmethod
    def validate_mime_type(cls, v):
        """Accept only images from the explicit whitelist."""
        if v is None:
            return v
        if not isinstance(v, str):
            raise ValueError("image_mime_type must be a string")
        v = v.strip().lower()
        if v not in _ALLOWED_IMAGE_MIME_TYPES:
            raise ValueError("Unsupported image type. Use JPEG, PNG, or WebP.")
        return v

    @field_validator("client_message_id")
    @classmethod
    def validate_client_message_id(cls, v):
        if v is None:
            return v
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", v):
            raise ValueError("client_message_id has an invalid format.")
        return v

    @model_validator(mode="after")
    def validate_image_payload(self):
        """Require a complete, valid image payload when an image is attached.

        Previously an unsupported MIME type was silently converted to ``None``.
        That left the base64 data in the request but routed the turn through the
        text-only chain, which is surprising to users and makes invalid uploads
        difficult to diagnose.  Validate both fields together and reject bad
        base64 before it reaches the model provider.
        """
        if (self.image_base64 is None) != (self.image_mime_type is None):
            raise ValueError(
                "image_base64 and image_mime_type must be supplied together."
            )
        if self.image_base64 is None:
            return self

        try:
            decoded = b64decode(self.image_base64, validate=True)
        except (ValueError, TypeError):
            raise ValueError("image_base64 must be valid base64 data.") from None

        # Keep the server-side limit aligned with the 4 MB client-side limit.
        if len(decoded) > 4 * 1024 * 1024:
            raise ValueError("Image must be 4 MB or smaller.")

        # MIME types are user-controlled. Confirm the file signature before the
        # bytes are forwarded to the vision provider, and deliberately exclude
        # animated formats whose decoded size can be disproportionate to their
        # upload size.
        valid_signature = {
            "image/jpeg": decoded.startswith(b"\xff\xd8\xff"),
            "image/png": decoded.startswith(b"\x89PNG\r\n\x1a\n"),
            "image/webp": (
                    len(decoded) >= 12
                    and decoded[:4] == b"RIFF"
                    and decoded[8:12] == b"WEBP"
            ),
        }[self.image_mime_type]
        if not valid_signature:
            raise ValueError("Image data does not match image_mime_type.")
        return self


class ConversationResponse(BaseModel):
    """Response body for conversation create / fetch endpoints.

    `access_token` is returned only when a conversation is created. It is a
    bearer capability credential for anonymous conversation access and must
    never be persisted server-side in plaintext.
    """

    conversation: Conversation
    messages: list[Message] = Field(default_factory=list)
    access_token: str | None = None


class DestinationsListResponse(BaseModel):
    """Response body for GET /api/destinations/."""

    destinations: list[DestinationSummary] = Field(default_factory=list)
    total: int
