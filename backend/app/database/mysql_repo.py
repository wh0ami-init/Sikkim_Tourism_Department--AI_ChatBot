"""
MySQLRepository — real database backend for when the department's MySQL is available.

HOW TO ACTIVATE:
  1. Set USE_MOCK_DB=false in your .env file.
  2. Fill in MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
  3. Run the SQL schema in docs/schema.sql against the department's database.

This previously raised NotImplementedError on every single method, which is
why switching USE_MOCK_DB=false made every endpoint return a raw 500 with a
Python traceback instead of a clean response. It is now a full working
implementation matching docs/schema.sql exactly.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime

import mysql.connector
import mysql.connector.pooling as mysql_pooling

from app.database.base import BaseRepository, MessageRole
from app.districts import district_filter_values, normalize_district
from app.models.schemas import (
    AdminUser,
    Circular,
    Conversation,
    Destination,
    DestinationWrite,
    Message,
    TravelAgency,
)

logger = logging.getLogger(__name__)

# Common English words that would otherwise pass search_travel_agencies()'s
# `len(t) > 2` token filter and match almost every row in the table (e.g.
# "the"), starving out the unordered/unindexed candidate_pool LIMIT before
# a genuinely matching agency is ever scored. See search_travel_agencies()
# for the full explanation.
#
# This list is deliberately broad: it covers not just articles/prepositions
# but the generic question/request words a tourist naturally uses when
# asking about an agency ("do you have contact details for ..."). Without
# these, a normal phrasing like "what is the contact info for M/s
# Enchanting Sikkim Tours & Travels" burns through the token cap on
# "what"/"contact"/"info" before ever reaching "enchanting" — the agency's
# actual name never makes it into the SQL WHERE clause, so the row is
# never even fetched into the candidate pool, let alone scored.

def _row_to_circular(row: dict) -> Circular:
    issue_date = row["issue_date"]
    return Circular(
        id=row["id"],
        title=row["title"],
        category=row["category"],
        district=row.get("district"),
        issue_date=issue_date.isoformat() if hasattr(issue_date, "isoformat") else str(issue_date),
        source_url=row["source_url"],
        pdf_hash=row["pdf_hash"],
        extracted_text=row["extracted_text"],
        ingested_at=row["ingested_at"],
    )


def _row_to_travel_agency(row: dict) -> TravelAgency:
    synced_at = row["synced_at"]
    return TravelAgency(
        id=row["id"],
        name=row["name"],
        registration_number=row["registration_number"],
        proprietor=row.get("proprietor"),
        address=row.get("address"),
        district=normalize_district(row.get("district")),
        grade=row.get("grade"),
        contact=row.get("contact"),
        email_or_website=row.get("email_or_website"),
        date_of_issue=row.get("date_of_issue"),
        renewed_upto=row.get("renewed_upto"),
        synced_at=synced_at,
    )


def _row_to_destination(row: dict) -> Destination:
    highlights = row.get("highlights") or []
    tags = row.get("tags") or []
    if isinstance(highlights, str):
        highlights = json.loads(highlights)
    if isinstance(tags, str):
        tags = json.loads(tags)
    return Destination(
        id=row["id"],
        name=row["name"],
        slug=row["slug"],
        category=row["category"],
        description=row["description"],
        location=row["location"],
        district=row["district"],
        altitude=row.get("altitude"),
        best_time=row["best_time"],
        entry_fee=row.get("entry_fee"),
        permit_required=bool(row.get("permit_required")),
        permit_info=row.get("permit_info"),
        how_to_reach=row["how_to_reach"],
        highlights=highlights,
        tags=tags,
        image_placeholder=row.get("image_placeholder") or "",
        image_url=row.get("image_url"),
        latitude=row.get("latitude"),
        longitude=row.get("longitude"),
    )


def _destination_params(destination: DestinationWrite) -> tuple:
    """Convert a validated admin payload into MySQL's column order."""
    return (
        destination.name,
        destination.slug,
        destination.category,
        destination.description,
        destination.location,
        destination.district,
        destination.altitude,
        destination.best_time,
        destination.entry_fee,
        destination.permit_required,
        destination.permit_info,
        destination.how_to_reach,
        json.dumps(destination.highlights),
        json.dumps(destination.tags),
        destination.image_placeholder,
        destination.image_url,
        destination.latitude,
        destination.longitude,
    )


def _row_to_conversation(row: dict) -> Conversation:
    return Conversation(id=row["id"], created_at=row["created_at"])


def _row_to_message(row: dict) -> Message:
    return Message(
        id=row["id"],
        conversation_id=row["conversation_id"],
        role=row["role"],
        content=row["content"],
        client_message_id=row.get("client_message_id"),
        created_at=row["created_at"],
    )


class MySQLRepository(BaseRepository):
    """
    Concrete MySQL implementation using mysql-connector-python with a
    connection pool. mysql-connector-python has no native asyncio support,
    so every query is dispatched to a worker thread via `asyncio.to_thread`
    — this keeps FastAPI's event loop responsive instead of blocking it for
    the duration of each round-trip to MySQL.
    """

    def __init__(
            self,
            host: str,
            port: int,
            user: str,
            password: str,
            database: str,
            ssl_ca: str | None = None,
            require_tls: bool = False,
    ) -> None:
        try:
            connection_options = {
                "pool_name": "sikkim_tourism_pool",
                "pool_size": 5,
                "host": host,
                "port": port,
                "user": user,
                "password": password,
                "database": database,
                "autocommit": True,
            }
            if require_tls:
                connection_options.update({"ssl_ca": ssl_ca, "ssl_verify_cert": True})
            self._pool = mysql_pooling.MySQLConnectionPool(
                **connection_options,
            )
            logger.info("MySQLRepository connected to %s:%s/%s", host, port, database)
        except mysql.connector.Error as exc:
            logger.error("Failed to initialise MySQL connection pool: %s", exc)
            raise

    # ── Low-level helpers ──────────────────────────────────────────────────────

    def _query(self, sql: str, params: tuple = ()) -> list[dict]:
        """Run a read query and always return the connection to the pool."""
        conn = self._pool.get_connection()
        try:
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(sql, params)
                rows = cursor.fetchall()
                return rows
            finally:
                cursor.close()
        finally:
            conn.close()

    def _execute(self, sql: str, params: tuple = ()) -> int:
        """
        Execute a write statement (INSERT / UPDATE / DELETE).
        Both the cursor and the connection are always returned to the pool,
        even if cursor.execute() raises — preventing connection leaks.
        The nested cleanup keeps a failed query from leaking a pooled
        connection.
        """
        conn = self._pool.get_connection()
        try:
            cursor = conn.cursor()
            try:
                cursor.execute(sql, params)
                return cursor.rowcount
            finally:
                # Close cursor inside its own try/finally so a failed
                # execute() cannot prevent the connection from being
                # returned to the pool by the outer finally block.
                cursor.close()
        finally:
            conn.close()

    # ── Admin accounts ─────────────────────────────────────────────────────

    async def admin_user_exists(self) -> bool:
        rows = await asyncio.to_thread(
            self._query, "SELECT 1 FROM admin_users LIMIT 1"
        )
        return bool(rows)

    async def get_admin_user(self, username: str) -> AdminUser | None:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT username, password_hash FROM admin_users WHERE username = %s LIMIT 1",
            (username.lower(),),
        )
        return AdminUser(**rows[0]) if rows else None

    async def create_admin_user(self, user: AdminUser) -> None:
        await asyncio.to_thread(
            self._execute,
            "INSERT INTO admin_users (username, password_hash) VALUES (%s, %s)",
            (user.username.lower(), user.password_hash),
        )

    async def update_admin_password(self, username: str, password_hash: str) -> bool:
        updated = await asyncio.to_thread(
            self._execute,
            "UPDATE admin_users SET password_hash = %s WHERE username = %s",
            (password_hash, username.lower()),
        )
        return updated > 0

    async def update_admin_credentials(self, username: str, new_username: str, password_hash: str) -> bool:
        updated = await asyncio.to_thread(
            self._execute,
            "UPDATE admin_users SET username = %s, password_hash = %s WHERE username = %s",
            (new_username.lower(), password_hash, username.lower()),
        )
        return updated > 0

    # ── Circulars ──────────────────────────────────────────────────────────

    async def list_circulars(
            self,
            category: str | None = None,
            limit: int = 10,
    ) -> list[Circular]:
        clauses, params = [], []
        if category:
            clauses.append("category = %s")
            params.append(category)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await asyncio.to_thread(
            self._query,
            f"SELECT * FROM circulars {where} ORDER BY issue_date DESC LIMIT %s",
            (*params, limit),
        )
        return [_row_to_circular(r) for r in rows]

    async def circular_exists(self, pdf_hash: str) -> bool:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT id FROM circulars WHERE pdf_hash = %s LIMIT 1",
            (pdf_hash,),
        )
        return bool(rows)

    async def save_circular(self, circular: Circular) -> Circular:
        def _insert() -> int:
            conn = self._pool.get_connection()
            try:
                cursor = conn.cursor()
                try:
                    cursor.execute(
                        "INSERT INTO circulars "
                        "(title, category, district, issue_date, source_url, pdf_hash, extracted_text, ingested_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                        (
                            circular.title,
                            circular.category,
                            circular.district,
                            circular.issue_date,
                            circular.source_url,
                            circular.pdf_hash,
                            circular.extracted_text,
                            circular.ingested_at,
                        ),
                    )
                    return cursor.lastrowid
                finally:
                    cursor.close()
            finally:
                conn.close()

        new_id = await asyncio.to_thread(_insert)
        return circular.model_copy(update={"id": new_id})

    async def delete_circular(self, circular_id: int) -> bool:
        deleted = await asyncio.to_thread(
            self._execute, "DELETE FROM circulars WHERE id = %s", (circular_id,)
        )
        return deleted > 0

    # ── Travel Agencies ────────────────────────────────────────────────────

    async def list_travel_agencies(
            self,
            district: str | None = None,
            limit: int = 100,
    ) -> list[TravelAgency]:
        clauses, params = [], []
        if district:
            district_values = district_filter_values(district)
            if not district_values:
                return []
            placeholders = ", ".join(["%s"] * len(district_values))
            clauses.append(f"LOWER(TRIM(district)) IN ({placeholders})")
            params.extend(district_values)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await asyncio.to_thread(
            self._query,
            f"SELECT * FROM travel_agencies {where} ORDER BY name ASC LIMIT %s",
            (*params, limit),
        )
        return [_row_to_travel_agency(r) for r in rows]

    async def count_travel_agencies(self, district: str | None = None) -> int:
        clauses, params = [], []
        if district:
            district_values = district_filter_values(district)
            if not district_values:
                return 0
            placeholders = ", ".join(["%s"] * len(district_values))
            clauses.append(f"LOWER(TRIM(district)) IN ({placeholders})")
            params.extend(district_values)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await asyncio.to_thread(
            self._query,
            f"SELECT COUNT(*) AS total FROM travel_agencies {where}",
            tuple(params),
        )
        return int(rows[0]["total"]) if rows else 0

    async def agency_exists(self, registration_number: str) -> bool:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT id FROM travel_agencies WHERE registration_number = %s LIMIT 1",
            (registration_number,),
        )
        return bool(rows)

    async def save_travel_agency(self, agency: TravelAgency) -> TravelAgency:
        def _upsert() -> int:
            conn = self._pool.get_connection()
            try:
                cursor = conn.cursor()
                try:
                    cursor.execute(
                        "INSERT INTO travel_agencies "
                        "(name, registration_number, proprietor, address, district, grade, "
                        "contact, email_or_website, date_of_issue, renewed_upto, synced_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                        "ON DUPLICATE KEY UPDATE "
                        "name=VALUES(name), proprietor=VALUES(proprietor), address=VALUES(address), "
                        "district=VALUES(district), grade=VALUES(grade), contact=VALUES(contact), "
                        "email_or_website=VALUES(email_or_website), date_of_issue=VALUES(date_of_issue), "
                        "renewed_upto=VALUES(renewed_upto), synced_at=VALUES(synced_at), "
                        "id=LAST_INSERT_ID(id)",
                        (
                            agency.name,
                            agency.registration_number,
                            agency.proprietor,
                            agency.address,
                            agency.district,
                            agency.grade,
                            agency.contact,
                            agency.email_or_website,
                            agency.date_of_issue,
                            agency.renewed_upto,
                            agency.synced_at,
                        ),
                    )
                    return cursor.lastrowid
                finally:
                    cursor.close()
            finally:
                conn.close()

        new_id = await asyncio.to_thread(_upsert)
        return agency.model_copy(update={"id": new_id})

    async def get_travel_agency_by_name(
            self, name: str, district: str | None = None
    ) -> TravelAgency | None:
        """
        Exact, deterministic agency-name lookup.

        This is intentionally separate from FULLTEXT search.  A question such
        as "details of Sikkim Tours & Travels" is an entity lookup, not a
        relevance-ranking problem.  If the registered name exists, return that
        row directly so the LLM never has to guess which candidate was meant.
        """
        clauses = ["LOWER(TRIM(name)) = LOWER(TRIM(%s))"]
        params: list = [name.strip()]
        if district:
            values = district_filter_values(district)
            if not values:
                return None
            placeholders = ", ".join(["%s"] * len(values))
            clauses.append(f"LOWER(TRIM(district)) IN ({placeholders})")
            params.extend(values)
        rows = await asyncio.to_thread(
            self._query,
            f"SELECT * FROM travel_agencies WHERE {' AND '.join(clauses)} LIMIT 1",
            tuple(params),
        )
        return _row_to_travel_agency(rows[0]) if rows else None

    async def search_travel_agencies(self, query: str, limit: int = 5) -> list[TravelAgency]:
        """
        Broad candidate retrieval for the entity resolver.

        IMPORTANT: this method is *candidate retrieval*, not final identity
        resolution.  It deliberately preserves words such as ``tour``,
        ``tours`` and ``travels`` because they may be part of the actual
        registered business name.  The resolver performs the final exact /
        normalized / fuzzy ranking in Python.
        """
        raw = " ".join(query.split())
        if not raw:
            return []

        # Exact case-insensitive name match is the safest and cheapest path.
        exact = await self.get_travel_agency_by_name(raw)
        if exact:
            return [exact]

        # FULLTEXT gets a wider candidate pool than the old top-5 query.
        # The resolver will decide which candidate, if any, is safe to use.
        fulltext_rows = await asyncio.to_thread(
            self._query,
            "SELECT *, MATCH(name, proprietor) AGAINST (%s IN NATURAL LANGUAGE MODE) AS relevance "
            "FROM travel_agencies "
            "WHERE MATCH(name, proprietor) AGAINST (%s IN NATURAL LANGUAGE MODE) "
            "ORDER BY relevance DESC LIMIT %s",
            (raw, raw, max(limit, 25)),
        )
        if fulltext_rows:
            return [_row_to_travel_agency(r) for r in fulltext_rows[:limit]]

        # LIKE fallback: use every meaningful token, but fetch a large pool and
        # rank it in Python.  This avoids the old bug where an unordered LIMIT
        # could fill the pool with unrelated agencies containing generic words.
        tokens = [
            t for t in re.findall(r"[A-Za-z0-9]+", raw.casefold())
            if len(t) > 1 and t not in {"the", "and", "for", "of", "in", "on", "at", "to", "a", "an"}
        ][:20]
        if not tokens:
            return []

        clauses: list[str] = []
        params: list = []
        for token in tokens:
            escaped = token.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            like = f"%{escaped}%"
            clauses.append("(LOWER(name) LIKE %s ESCAPE '!' OR LOWER(proprietor) LIKE %s ESCAPE '!')")
            params.extend([like, like])

        rows = await asyncio.to_thread(
            self._query,
            f"SELECT * FROM travel_agencies WHERE {' OR '.join(clauses)} ORDER BY name ASC LIMIT %s",
            (*params, max(limit, 100)),
        )
        return [_row_to_travel_agency(r) for r in rows[:limit]]

    # ── Destinations ────────────────────────────────────────────────────────

    async def list_destinations(
            self,
            search: str | None = None,
            category: str | None = None,
    ) -> list[Destination]:
        clauses = []
        params: list = []
        if category:
            clauses.append("category = %s")
            params.append(category)
        if search:
            escaped_search = search.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            like = f"%{escaped_search}%"
            clauses.append("(name LIKE %s ESCAPE '!' OR description LIKE %s ESCAPE '!' OR district LIKE %s ESCAPE '!' OR location LIKE %s ESCAPE '!')")
            params.extend([like, like, like, like])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = await asyncio.to_thread(
            self._query,
            f"SELECT * FROM destinations {where} ORDER BY name ASC",
            tuple(params),
        )
        return [_row_to_destination(r) for r in rows]

    async def get_destination(self, destination_id: int) -> Destination | None:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT * FROM destinations WHERE id = %s",
            (destination_id,),
        )
        return _row_to_destination(rows[0]) if rows else None

    async def create_destination(self, destination: DestinationWrite) -> Destination:
        def _insert() -> int:
            conn = self._pool.get_connection()
            try:
                cursor = conn.cursor()
                try:
                    cursor.execute(
                        "INSERT INTO destinations "
                        "(name, slug, category, description, location, district, altitude, best_time, "
                        "entry_fee, permit_required, permit_info, how_to_reach, highlights, tags, "
                        "image_placeholder, image_url, latitude, longitude) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                        _destination_params(destination),
                    )
                    return cursor.lastrowid
                finally:
                    cursor.close()
            finally:
                conn.close()

        return Destination(id=await asyncio.to_thread(_insert), **destination.model_dump())

    async def update_destination(
            self, destination_id: int, destination: DestinationWrite
    ) -> Destination | None:
        updated = await asyncio.to_thread(
            self._execute,
            "UPDATE destinations SET "
            "name = %s, slug = %s, category = %s, description = %s, location = %s, district = %s, "
            "altitude = %s, best_time = %s, entry_fee = %s, permit_required = %s, permit_info = %s, "
            "how_to_reach = %s, highlights = %s, tags = %s, image_placeholder = %s, image_url = %s, "
            "latitude = %s, longitude = %s WHERE id = %s",
            (*_destination_params(destination), destination_id),
        )
        return Destination(id=destination_id, **destination.model_dump()) if updated else None

    async def delete_destination(self, destination_id: int) -> bool:
        deleted = await asyncio.to_thread(
            self._execute, "DELETE FROM destinations WHERE id = %s", (destination_id,)
        )
        return deleted > 0

    async def search_destinations_for_rag(self, query: str) -> list[Destination]:
        """Search the full-text index, then fall back to a literal LIKE query."""
        rows = await asyncio.to_thread(
            self._query,
            "SELECT * FROM destinations "
            "WHERE MATCH(name, description) AGAINST (%s IN NATURAL LANGUAGE MODE) "
            "LIMIT 4",
            (query,),
        )
        if not rows:
            # FULLTEXT can miss short or uncommon queries; escape wildcard
            # characters before using the literal fallback.
            escaped_query = (
                query.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_")
            )
            like = f"%{escaped_query}%"
            rows = await asyncio.to_thread(
                self._query,
                "SELECT * FROM destinations WHERE name LIKE %s ESCAPE '\\' OR description LIKE %s ESCAPE '\\' LIMIT 4",
                (like, like),
            )
        return [_row_to_destination(r) for r in rows]

    # ── Conversations ────────────────────────────────────────────────────────

    async def create_conversation(self) -> Conversation:
        conv = Conversation()
        await asyncio.to_thread(
            self._execute,
            "INSERT INTO conversations (id, created_at) VALUES (%s, %s)",
            (conv.id, conv.created_at),
        )
        return conv

    async def get_conversation(self, conversation_id: str) -> Conversation | None:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT * FROM conversations WHERE id = %s",
            (conversation_id,),
        )
        return _row_to_conversation(rows[0]) if rows else None

    # ── Messages ─────────────────────────────────────────────────────────

    async def add_message(
            self,
            conversation_id: str,
            role: "MessageRole",
            content: str,
            client_message_id: str | None = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            client_message_id=client_message_id,
        )
        await asyncio.to_thread(
            self._execute,
            "INSERT INTO messages (id, conversation_id, role, content, client_message_id, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (msg.id, msg.conversation_id, msg.role, msg.content, client_message_id, msg.created_at),
        )
        return msg

    async def get_message_by_client_id(
            self, conversation_id: str, client_message_id: str
    ) -> Message | None:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT * FROM messages WHERE conversation_id = %s AND client_message_id = %s LIMIT 1",
            (conversation_id, client_message_id),
        )
        return _row_to_message(rows[0]) if rows else None

    async def list_messages(self, conversation_id: str) -> list[Message]:
        rows = await asyncio.to_thread(
            self._query,
            "SELECT * FROM messages WHERE conversation_id = %s ORDER BY created_at ASC",
            (conversation_id,),
        )
        return [_row_to_message(r) for r in rows]