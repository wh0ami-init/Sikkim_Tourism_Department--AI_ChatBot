"""
 Abstract_Repository  — interface for application persistence.

Add a new backend by subclassing BaseRepository and implementing every abstract
method.  The rest of the app imports only this interface and get_repo() from
factory.py, so the concrete implementation can be swapped without touching any
other file.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal

from app.models.schemas import (
    AdminUser,
    Circular,
    Conversation,
    Destination,
    DestinationWrite,
    Message,
    TravelAgency,
)

MessageRole = Literal["user", "assistant"]

class BaseRepository(ABC):
    """Common interface for application persistence."""
    @abstractmethod
    async def admin_user_exists(self) -> bool:
        """Return whether the first password-based admin account exists."""
        ...

    @abstractmethod
    async def get_admin_user(self, username: str) -> AdminUser | None:
        """Return an admin's password record, if present."""
        ...

    @abstractmethod
    async def create_admin_user(self, user: AdminUser) -> None:
        """Persist the first admin account."""
        ...

    @abstractmethod
    async def update_admin_password(self, username: str, password_hash: str) -> bool:
        """Replace an existing admin password hash."""
        ...

    @abstractmethod
    async def update_admin_credentials(self, username: str, new_username: str, password_hash: str) -> bool:
        """Atomically replace an existing admin username and password hash."""
        ...

    @abstractmethod
    async def list_circulars(
            self,
            category: str | None = None,
            limit: int = 10,
    ) -> list[Circular]:
        """Return the most recent circulars, newest first, optionally filtered by category."""
        ...

    @abstractmethod
    async def circular_exists(self, pdf_hash: str) -> bool:
        """True if a circular with this exact PDF hash has already been ingested."""
        ...

    @abstractmethod
    async def refresh_circular_listing_metadata(
            self, pdf_hash: str, title: str, category: str, source_url: str,
    ) -> None:
        """Refresh a scraped circular's title/category without reprocessing its PDF."""
        ...

    @abstractmethod
    async def save_circular(self, circular: Circular) -> Circular:
        """Persist a newly-scraped circular and return it."""
        ...

    @abstractmethod
    async def get_circular_file(self, circular_id: int) -> Circular | None:
        """Return a circular with its stored upload payload, when available."""
        ...

    @abstractmethod
    async def list_travel_agencies(
            self,
            district: str | None = None,
            limit: int = 100,
    ) -> list[TravelAgency]:
        """Return registered travel agencies, optionally filtered by district."""
        ...

    @abstractmethod
    async def count_travel_agencies(self, district: str | None = None) -> int:
        """Return the true total number of registered agencies (optionally by district) —
        used to answer 'how many agencies' honestly instead of reporting a truncated
        sample size as if it were the total."""
        ...

    @abstractmethod
    async def search_travel_agencies(self, query: str, limit: int = 5) -> list[TravelAgency]:
        """Free-text lookup (name/proprietor) used to answer 'email/contact for X' questions."""
        ...

    @abstractmethod
    async def get_travel_agency_by_name(
            self, name: str, district: str | None = None
    ) -> TravelAgency | None:
        """Return one exact agency-name match, optionally within a district."""
        ...

    @abstractmethod
    async def agency_exists(self, registration_number: str) -> bool:
        """True if an agency with this registration number has already been synced."""
        ...

    @abstractmethod
    async def save_travel_agency(self, agency: TravelAgency) -> TravelAgency:
        """Insert or update (upsert, keyed by registration_number) and return it."""
        ...

    @abstractmethod
    async def list_destinations(
            self,
            search: str | None = None,
            category: str | None = None,
    ) -> list[Destination]:
        """Return all destinations, optionally filtered by free-text and/or category."""
        ...

    @abstractmethod
    async def get_destination(self, destination_id: int) -> Destination | None:
        """Return a single destination by Primary-Key-ID, or None if not found."""
        ...

    @abstractmethod
    async def create_destination(self, destination: DestinationWrite) -> Destination:
        """Persist a new destination and return its database-assigned ID."""
        ...

    @abstractmethod
    async def update_destination(
            self, destination_id: int, destination: DestinationWrite
    ) -> Destination | None:
        """Replace an existing destination, or return None when it does not exist."""
        ...

    @abstractmethod
    async def delete_destination(self, destination_id: int) -> bool:
        """Delete a destination and report whether a row was removed."""
        ...

    @abstractmethod
    async def delete_circular(self, circular_id: int) -> bool:
        """Delete a circular and report whether a row was removed."""
        ...

    @abstractmethod
    async def search_destinations_for_rag(self, query: str) -> list[Destination]:
        """
        Keyword_Search or Semantic_Match used by the RAG service to ground AI responses.
        Returns up to 4 most-relevant Destination objects.
        """
        ...
    @abstractmethod
    async def create_conversation(self, access_token_hash: str) -> Conversation:
        """Create and persist a new empty conversation using a hashed access token."""
        ...

    @abstractmethod
    async def get_conversation(self, conversation_id: str, access_token: str) -> Conversation | None:
        """Return a conversation only when its bearer access token is valid."""
        ...
    @abstractmethod
    async def add_message(
            self,
            conversation_id: str,
            role: MessageRole,
            content: str,
            client_message_id: str | None = None,
    ) -> Message:
        """Persist and return a new message belonging to `conversation_id`."""
        ...

    @abstractmethod
    async def get_message_by_client_id(
            self, conversation_id: str, client_message_id: str
    ) -> Message | None:
        """Return a previously accepted user message for an idempotent retry."""
        ...

    @abstractmethod
    async def list_messages(self, conversation_id: str) -> list[Message]:
        """Return all messages for `conversation_id`, ordered oldest → newest."""
        ...
