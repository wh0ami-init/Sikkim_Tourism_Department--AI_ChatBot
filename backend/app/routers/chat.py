"""
Chat router — manages conversations and SSE-streamed AI responses.

Now powered by LangChain + Qdrant RAG (see app/services/rag_chain.py).

SSE endpoint: POST /api/conversations/{id}/chat
The client reads chunks with EventSource or fetch + ReadableStream.
Each event is `data: <json>\\n\\n`:
  - {"text": "..."}        — a chunk of the assistant's streamed reply
  - {"suggestions": [...]} — up to 3 follow-up-question chips, sent once
                             right after the reply finishes (best-effort;
                             may be omitted entirely if generation fails)
  - "[DONE]"                — end of stream

Vision path (image attached):
  When the request body contains image_base64 + image_mime_type the turn is
  routed through stream_rag_response_with_image (Gemini Vision) instead of
  the default text-only Groq chain.
"""
from __future__ import annotations

import json
import secrets
import hashlib
import logging
import re
from datetime import date
from difflib import get_close_matches
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database.base import BaseRepository
from app.database.factory import get_repo
from app.districts import district_filter_values, normalize_district
from app.limiting import limiter
from app.models.schemas import ChatRequest, ConversationResponse, Message
from app.services.entity_resolver import resolve_travel_agency
from app.services.rag_chain import (
    stream_rag_response,
    stream_rag_response_with_image,
    generate_followups,
    search_official_sikkim_tourism,
)

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_HISTORY_MESSAGES = 16

_FULL_CATALOG_PHRASES = (
    "list all",
    "all destinations",
    "all places",
    "places to visit",
    "places can i visit",
    "what can i visit",
    "where can i go",
    "what to see",
    "tourist attractions",
    "sightseeing",
)

_LATEST_UPDATE_PHRASES = (
    "latest update",
    "latest news",
    "any notice",
    "recent notice",
    "recent circular",
    "road status",
    "road situation",
    "road block",
    "road blocked",
    "road open",
    "road closed",
    "is the road",
    "cancellation order",
    "any update",
)

_AGENCY_LOOKUP_PHRASES = (
    "travel agency", "travel agencies", "tour operator", "tour operators",
    "tours and travels", "tour and travels",
)

# Bare words that mean this is very likely about a specific registered
# agency, regardless of how the rest of the sentence is phrased — e.g.
# "give me full data of bayul tours and travels" has none of the exact
# phrases above, but "tours"/"travels" + an info-seeking word is exactly
# what a real-world agency lookup looks like.
_AGENCY_ENTITY_WORDS = ("agency", "agencies", "agent", "agents", "tour", "tours", "travels", "travel")
_AGENCY_INTENT_WORDS = (
    "email", "contact", "phone", "number", "registration", "detail",
    "details", "data", "info", "information", "address", "website",
    "proprietor", "owner", "grade",
)

# Words that signal this is a GENERAL tourism question ("best tour package",
# "places to visit") rather than a lookup of one specific named business —
# used to keep the bare-name tier below from over-triggering on those.
_AGENCY_GENERIC_WORDS = (
    "best", "how", "what", "where", "when", "which", "why", "recommend",
    "recommended", "suggest", "package", "packages", "itinerary", "plan",
    "places", "place", "destination", "destinations", "visit",
)


def _needs_agency_lookup(message: str) -> bool:
    text = " ".join(message.lower().split())
    if any(phrase in text for phrase in _AGENCY_LOOKUP_PHRASES):
        return True
    # Generic recommendation/list questions must not enter the single-entity
    # resolver.  Those should use the directory/RAG path instead.
    if any(word in text for word in ("recommend", "recommended", "suggest", "best", "package", "itinerary")):
        return False
    # Use whole words here. The older substring checks treated "tourism" as
    # "tour" and sent ordinary questions such as upcoming festival information
    # into the travel-agency resolver.
    words = set(re.findall(r"[a-z]+", text))
    if "agency" in words or "agencies" in words:
        return True
    has_entity_word = bool(words.intersection(_AGENCY_ENTITY_WORDS))
    has_intent_word = bool(words.intersection(_AGENCY_INTENT_WORDS))
    if has_entity_word and has_intent_word:
        return True
    if (
            has_entity_word
            and len(words) <= 8
            and not words.intersection(_AGENCY_GENERIC_WORDS)
    ):
        return True
    return False


_AGENCY_LISTING_PHRASES = (
    "list all", "list agencies", "list of agencies", "list travel agencies",
    "list of travel agencies", "list the agencies",
    "how many agencies", "how many travel agencies", "how many agency",
    "all agencies", "all travel agencies", "agencies in", "travel agencies in",
    "agencies registered in", "agencies are there", "agencies operate",
)


def _needs_agency_directory_listing(message: str, history: list[dict] | None = None) -> bool:
    """
    True for a "how many / list all agencies [in <district>]" style
    question — distinct from _needs_agency_lookup, which is about one
    specific named agency. This path returns a real total count instead
    of silently truncating to search_travel_agencies' 5-result cap and
    letting the model present that as if it were the complete list.

    Also true for a bare district-name follow-up (e.g. "what about
    Namchi?", "and Pakyong?") when the previous turn was itself an agency
    directory question. Without this, "agencies in Gangtok?" worked (it
    matches _AGENCY_LISTING_PHRASES directly) but a natural follow-up
    asking about a different district didn't — it has none of those exact
    phrases, so it silently fell through to the general model instead of
    the real directory data. Mirrors how _needs_latest_circulars() already
    handles bare circular follow-ups.
    """
    text = " ".join(message.lower().split())
    if any(phrase in text for phrase in _AGENCY_LISTING_PHRASES):
        return True
    if _extract_district(message) and any(word in text for word in ("agency", "agencies", "operator", "operators")):
        return True
    if history and _extract_district(message):
        for m in history[-4:]:
            recent = " ".join(m.get("content", "").lower().split())
            if any(phrase in recent for phrase in _AGENCY_LISTING_PHRASES):
                return True
    return False


def _extract_district(message: str) -> str | None:
    text = " ".join(message.lower().split())
    # Check longer aliases first so "East Sikkim" is not reduced to "East".
    for alias in sorted(
            (item for canonical in ("Gangtok", "Mangan", "Namchi", "Soreng", "Gyalshing", "Pakyong")
             for item in district_filter_values(canonical)),
            key=len,
            reverse=True,
    ):
        if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", text):
            return normalize_district(alias)
    return None


_CIRCULAR_INVENTORY_PHRASES = (
    "how many road status", "how many road reports", "how many circular",
    "how many report", "how many cancellation", "how many notice",
    "list all road status", "list the road status",
    "all road status reports", "which road status reports", "what dates",
    "recent cancellation order", "recent cancellation orders",
    "any recent cancellation order", "any recent cancellation orders",
)

_CIRCULAR_INVENTORY_SAMPLE_LIMIT = 20

_CURRENT_EVENT_WORDS = ("event", "events", "festival", "festivals", "celebration", "celebrations")
_NAMED_FESTIVAL_TERMS = ("pang lhabsol", "losar", "bumchu", "saga dawa", "tendong lho rum fat")
_CURRENT_EVENT_QUALIFIERS = (
    "upcoming", "current", "currently", "latest", "next", "this week",
    "this month", "this year", "today", "tomorrow", "schedule", "calendar",
    "happening", "date", "dates", "when",
)

_EMERGENCY_TERMS = ("stranded", "landslide", "accident", "injured", "emergency", "trapped", "rescue")
_MEDICAL_TERMS = ("altitude sickness", "medicine", "medication", "diamox", "acetazolamide", "dexamethasone")
_AGENCY_RECOMMENDATION_TERMS = ("recommend", "recommended", "best", "suggest")
_OFFICIAL_FACT_TERMS = ("permit", "permits", "entry fee", "entry fees", "ticket price", "ticket prices")
_RESTRICTED_ACCESS_TERMS = (
    "foreign tourist", "foreign tourists", "foreign national", "foreign nationals",
    "foreign visitor", "foreign visitors", "restricted area",
)
_CONTEXTUAL_REFERENCE_TERMS = (
    "it", "that", "this", "there", "that place", "this place", "same place",
    "that destination", "this destination",
)
_LIVE_DATA_RETRY_TERMS = (
    "online", "live data", "official website", "track from", "search from",
    "check from", "use official", "latest data",
)
_DESTINATION_LIST_TERMS = (
    "destination", "destinations", "place", "places", "attraction", "attractions",
    "visit", "see", "sightseeing",
)
_DESTINATION_DETAIL_TERMS = (
    "about", "detail", "details", "information", "info", "where", "location",
    "reach", "how to reach", "best time", "highlights", "things to do",
    "altitude", "category",
)
_DESTINATION_RECORD_PHRASES = (
    "tell me about",
    "about",
    "detail",
    "details",
    "information",
    "info",
    "where is",
    "where's",
    "location",
    "located",
    "reach",
    "how to reach",
    "best time",
    "entry fee",
    "permit",
    "altitude",
    "highlight",
    "things to do",
    "visit",
    "see",
    "sightseeing",
    "attraction",
    "attractions",
    "destination",
    "destinations",
    "place",
    "places",
)
_PERMIT_OVERVIEW_TERMS = (
    "how many", "types", "type", "kinds", "kind", "which permits",
    "what permits", "list permits", "permits are there", "permit categories",
)


def _messages_to_history(messages: list[Message]) -> list[dict]:
    """
    Convert stored Message objects into the simple dict format
    expected by the RAG chain (excludes the very last message,
    which is the current user turn being processed now).
    """
    return [
        {"role": m.role, "content": m.content}
        for m in messages[:-1]
    ][-MAX_HISTORY_MESSAGES:]


def _is_valid_uuid(val: str) -> bool:
    """Validate UUID format."""
    try:
        UUID(val)
        return True
    except (ValueError, AttributeError):
        return False


def _needs_full_destination_context(message: str) -> bool:
    return any(phrase in " ".join(message.lower().split()) for phrase in _FULL_CATALOG_PHRASES)


def _looks_like_circular_followup(message: str) -> bool:
    """True for short follow-ups that depend on a previous circular/road turn."""
    text = " ".join(message.lower().split())
    if not text:
        return False

    if any(phrase in text for phrase in _LATEST_UPDATE_PHRASES):
        return True

    if _extract_district(message) and (
        len(text.split()) <= 6
        or any(word in text for word in ("road", "route", "status", "open", "closed", "blocked"))
    ):
        return True

    if re.search(
        r"\b(?:of|on|for|the)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b|"
        r"\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b",
        text,
    ):
        return True

    if re.search(r"\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b", text):
        return True

    followup_markers = (
        "what about",
        "and ",
        "also ",
        "same",
        "that",
        "this",
        "it",
        "full detail",
        "full details",
        "more detail",
        "more details",
    )
    return len(text.split()) <= 8 and any(marker in text for marker in followup_markers)


def _needs_latest_circulars(message: str, history: list[dict] | None = None) -> bool:
    """
    True if the current message matches a road-status/circular keyword,
    OR if the last couple of turns in this conversation were already about
    circulars — so a bare follow-up like "okay of 27th" or "full details"
    still gets the real circular data instead of falling through to the
    model's general knowledge (which was inventing fake dates/roads).
    """
    text = " ".join(message.lower().split())
    if _needs_current_event_verification(message) or _needs_festival_information(message):
        return False
    if any(phrase in text for phrase in _LATEST_UPDATE_PHRASES):
        return True
    if not _looks_like_circular_followup(message):
        return False
    if history:
        for m in history[-4:]:
            recent = " ".join(m.get("content", "").lower().split())
            if any(phrase in recent for phrase in _LATEST_UPDATE_PHRASES):
                return True
    return False


def _needs_circular_inventory(message: str) -> bool:
    text = " ".join(message.lower().split())
    if any(phrase in text for phrase in _CIRCULAR_INVENTORY_PHRASES):
        return True
    # Also tolerate small typing mistakes such as "road staturs report".
    return "how many" in text and any(word in text for word in ("road", "report", "circular", "notice", "cancellation"))


def _inventory_circular_category(message: str) -> str | None:
    """Select a category only when the visitor explicitly asks for one."""
    text = " ".join(message.lower().split())
    if "road" in text:
        return "road_status"
    if "cancellation" in text:
        return "cancellation_order"
    if "tender" in text:
        return "tender"
    return None


def _needs_current_event_verification(message: str) -> bool:
    """Identify date-sensitive event questions that require a verified record."""
    text = " ".join(message.lower().split())
    return (
        any(word in text for word in _CURRENT_EVENT_WORDS)
        and (
            any(qualifier in text for qualifier in _CURRENT_EVENT_QUALIFIERS)
            or bool(re.search(r"\b20\d{2}\b", text))
        )
    )


def _official_event_search_query(message: str) -> str:
    """Bias official-domain search toward the Department's event pages."""
    return f"{message} festival fair notice newsletter"


def _needs_emergency_response(message: str) -> bool:
    text = message.casefold()
    urgent_terms = tuple(term for term in _EMERGENCY_TERMS if term != "emergency")
    if any(term in text for term in urgent_terms):
        return True
    return "emergency" in text and any(
        phrase in text
        for phrase in (
            "send help",
            "need help now",
            "immediate help",
            "immediate danger",
            "urgent help",
            "stuck",
        )
    )


def _needs_medical_response(message: str) -> bool:
    return any(term in message.casefold() for term in _MEDICAL_TERMS)


def _needs_contact_directory_guidance(message: str) -> bool:
    text = message.casefold()
    return any(
        phrase in text
        for phrase in (
            "emergency contact",
            "tourism contact",
            "contact information",
            "contact details",
            "helpline",
            "phone number",
        )
    ) and any(word in text for word in ("where", "find", "official", "travelling", "traveling", "while"))


def _format_contact_directory_guidance() -> str:
    return (
        "For official contact information while travelling in Sikkim, use the "
        "Tourism and Civil Aviation Department website and the official notices page:\n\n"
        "- https://sikkimtourism.gov.in\n"
        "- https://sikkimtourism.gov.in/updates/notice\n\n"
        "For an urgent situation, contact the nearest police, medical, road, or local authority directly. "
        "I do not have a verified current phone directory in this chat, so I will not list phone numbers."
    )


def _needs_transaction_response(message: str) -> bool:
    text = message.casefold()
    return any(
        phrase in text
        for phrase in (
            "book a hotel",
            "book hotel",
            "make a booking",
            "reserve",
            "reservation",
            "pay for",
            "make payment",
            "process payment",
            "buy ticket",
        )
    )


def _format_transaction_response() -> str:
    return (
        "I cannot make bookings, reservations, payments, or purchases. "
        "I can help you understand what to verify before booking, such as location, access, permits, "
        "cancellation terms, and whether the provider is properly registered."
    )


def _needs_off_topic_response(message: str) -> bool:
    text = message.casefold()
    if any(word in text for word in ("sikkim", "tourism", "travel", "trip", "permit", "destination")):
        return False
    return any(
        phrase in text
        for phrase in (
            "write python",
            "python code",
            "write code",
            "scrape a website",
            "coding",
            "programming",
        )
    )


def _format_off_topic_response() -> str:
    return (
        "I am the Sikkim Tourism Assistant and can only help with questions about "
        "Sikkim and visitor travel. Ask me about destinations, permits, routes, notices, "
        "culture, food, safety, or trip planning in Sikkim."
    )


def _needs_agency_recommendation(message: str) -> bool:
    text = message.casefold()
    return (
        any(term in text for term in _AGENCY_LOOKUP_PHRASES)
        and any(term in text for term in _AGENCY_RECOMMENDATION_TERMS)
    )


def _needs_exact_official_fact(message: str) -> bool:
    text = message.casefold()
    return any(term in text for term in _OFFICIAL_FACT_TERMS) or any(
        term in text for term in _RESTRICTED_ACCESS_TERMS
    )


def _has_contextual_reference(message: str) -> bool:
    text = " ".join(message.casefold().split())
    tokens = set(re.findall(r"[a-z]+", text))
    return any(
        (" " in term and term in text) or (" " not in term and term in tokens)
        for term in _CONTEXTUAL_REFERENCE_TERMS
    )


def _looks_like_official_fact_retry(message: str, history: list[dict] | None = None) -> bool:
    """True when the visitor asks to use live/official data for the prior fact question."""
    text = " ".join(message.casefold().split())
    if not any(term in text for term in _LIVE_DATA_RETRY_TERMS):
        return False
    return any(
        m.get("role") == "user" and _needs_exact_official_fact(m.get("content", ""))
        for m in (history or [])[-4:]
    )


async def _resolve_contextual_official_fact_message(
    repo: BaseRepository,
    message: str,
    history: list[dict] | None = None,
) -> str | None:
    """
    Resolve permit/fee follow-ups like "do we need a permit for it?" to the
    latest destination the visitor was discussing. Returns None when this turn
    is not an official fact question/retry.
    """
    is_fact_question = _needs_exact_official_fact(message)
    is_retry = _looks_like_official_fact_retry(message, history)
    if not is_fact_question and not is_retry:
        return None

    try:
        destinations = await repo.list_destinations()
    except Exception:
        destinations = []

    if destinations and _find_named_destinations(message, destinations):
        return message

    if not destinations or (is_fact_question and not _has_contextual_reference(message) and not is_retry):
        return message

    prior_fact_question = ""
    for item in reversed(history or []):
        if item.get("role") == "user" and _needs_exact_official_fact(item.get("content", "")):
            prior_fact_question = item.get("content", "")
            break

    destination = None
    for role in ("user", "assistant"):
        for item in reversed(history or []):
            if item.get("role") != role:
                continue
            matches = _find_named_destinations(item.get("content", ""), destinations)
            if matches:
                destination = matches[0]
                break
        if destination:
            break

    if not destination:
        return message if is_fact_question else None

    fact_text = prior_fact_question if is_retry and prior_fact_question else message
    lowered = fact_text.casefold()
    if "entry fee" in lowered or "ticket price" in lowered or "fee" in lowered:
        return f"What is the entry fee for {destination.name}?"
    if "foreign" in lowered or "restricted area" in lowered:
        return f"What restricted area permit rules apply for {destination.name}?"
    return f"Do I need a permit for {destination.name}?"


async def _needs_permit_overview_response(repo: BaseRepository, message: str) -> bool:
    """Route broad permit-category questions away from destination fee lookup."""
    text = " ".join(message.casefold().split())
    if "permit" not in text:
        return False
    if not any(term in text for term in _PERMIT_OVERVIEW_TERMS):
        return False

    try:
        destinations = await repo.list_destinations()
    except Exception:
        destinations = []

    named_destinations = _find_named_destinations(message, destinations) if destinations else []
    if named_destinations and not any(term in text for term in ("sikkim", "overall", "all permits", "types")):
        return False
    return True


def _format_permit_overview_response() -> str:
    """Explain Sikkim permit categories without inventing a destination rule."""
    return (
        "For visitors, Sikkim permits are best understood as **2 main permit regimes**, "
        "with route- or purpose-specific permits issued under them:\n\n"
        "1. **RAP / Restricted Area Permit** — mainly for foreign nationals entering Sikkim under the restricted-area regime.\n"
        "2. **PAP / Protected Area Permit** — for protected/border areas and specific destinations or activities.\n\n"
        "Common tourist permit paths include:\n"
        "- **Nathula permit** — issued for eligible Indian nationals through registered travel agencies.\n"
        "- **Two-wheeler / biker permit** — required for motorbike travel into specified protected areas.\n"
        "- **Trekking / mountaineering permits** — handled through the relevant Tourism/Adventure Cell process where applicable.\n\n"
        "The exact permit depends on nationality, destination, route, vehicle, and activity.\n\n"
        "Sources: https://sikkimtourism.gov.in/rap and https://www.sikkimtourism.gov.in/pap"
    )


def _needs_destination_list_response(message: str) -> bool:
    """True when the user asks for an official catalogue list, not narrative advice."""
    text = " ".join(message.casefold().split())
    if any(
        phrase in text
        for phrase in (
            "same day",
            "one day",
            "2 day",
            "two day",
            "3 day",
            "three day",
            "itinerary",
            "plan",
        )
    ):
        return False
    return _needs_full_destination_context(message) or (
        _extract_district(message) is not None
        and any(term in text for term in _DESTINATION_LIST_TERMS)
    )


def _needs_named_destination_record_response(message: str) -> bool:
    """True when a named place should be rendered as an exact catalogue record."""
    text = " ".join(message.casefold().split())
    if "same day" in text:
        return False
    if " from " in f" {text} " and any(
        term in text
        for term in ("reach", "route", "travel", "travelling", "traveling", "arrive", "arriving", "airport")
    ):
        return False
    if len(text.split()) <= 4:
        return True
    return any(phrase in text for phrase in _DESTINATION_RECORD_PHRASES)


def _format_destination_record(destination) -> list[str]:
    """Render one destination record exactly as stored in the Department catalogue."""
    permit = (
        destination.permit_info
        if destination.permit_required and destination.permit_info
        else ("Required" if destination.permit_required else "No permit requirement is recorded.")
    )
    lines = [
        f"**{destination.name}**",
        f"- District: {destination.district}",
        f"- Category: {destination.category}",
        f"- Location: {destination.location}",
    ]
    if destination.altitude:
        lines.append(f"- Altitude: {destination.altitude}")
    lines.extend([
        f"- Best time: {destination.best_time}",
        f"- Entry fee: {destination.entry_fee or 'No entry fee is recorded.'}",
        f"- Permit: {permit}",
        f"- How to reach: {destination.how_to_reach}",
    ])
    if destination.highlights:
        lines.append("- Highlights: " + ", ".join(destination.highlights))
    lines.append("")
    lines.append(destination.description)
    return lines


def _find_named_destinations(message: str, destinations: list) -> list:
    """Return catalogue destinations explicitly named by the visitor."""
    question = " ".join(message.casefold().split())
    exact = [
        destination
        for destination in destinations
        if destination.name.casefold() in question
    ]
    if exact:
        return exact

    # Keep fuzzy matching conservative and catalogue-bounded. This catches
    # small typos in a known destination without mapping an unknown place to a
    # plausible official record.
    words = re.findall(r"[a-z]{4,}", question)
    candidates = words + [" ".join(words[index:index + 2]) for index in range(len(words) - 1)]
    catalogue_names = [destination.name.casefold() for destination in destinations]
    matched_names = {
        match
        for candidate in candidates
        for match in get_close_matches(candidate, catalogue_names, n=1, cutoff=0.85)
    }
    return [
        destination
        for destination in destinations
        if destination.name.casefold() in matched_names
    ]


async def _format_destination_catalog_response(repo: BaseRepository, message: str) -> str | None:
    """Answer destination catalogue questions without model-generated facts."""
    try:
        destinations = await repo.list_destinations()
    except Exception as exc:
        logger.warning("Could not load destination catalogue: %s", exc)
        return (
            "I could not retrieve the official destination catalogue at the moment. "
            "Please try again shortly."
        )

    if not destinations:
        return "I do not currently have any official destination records on file."

    district = _extract_district(message)
    text = " ".join(message.casefold().split())
    wants_list = _needs_destination_list_response(message)
    named = (
        []
        if wants_list or not _needs_named_destination_record_response(message)
        else _find_named_destinations(message, destinations)
    )

    if named:
        if len(named) > 1:
            return None
        lines = []
        for index, destination in enumerate(named):
            if index:
                lines.append("")
            lines.extend(_format_destination_record(destination))
        lines.extend([
            "",
            "Source: Official Department destination catalogue. Current access, fees, and permits should be confirmed before travel.",
        ])
        return "\n".join(lines)

    if district and wants_list:
        matches = [
            destination for destination in destinations
            if normalize_district(destination.district) == district
        ]
        if not matches:
            return (
                f"I do not currently have official destination records for {district} in the catalogue."
            )
        lines = [
            f"There are **{len(matches)}** official destination records for {district} in the Department catalogue.",
            "",
        ]
        for destination in matches:
            lines.append(
                f"- **{destination.name}** ({destination.category}) — Best time: {destination.best_time}; "
                f"Permit: {'Required' if destination.permit_required else 'No permit requirement recorded'}."
            )
        lines.extend([
            "",
            "Source: Official Department destination catalogue.",
        ])
        return "\n".join(lines)

    if _needs_full_destination_context(message):
        lines = [
            f"There are **{len(destinations)}** official destination records in the Department catalogue.",
            "",
        ]
        for destination in destinations:
            lines.append(
                f"- **{destination.name}** ({destination.district}, {destination.category}) — "
                f"Best time: {destination.best_time}."
            )
        lines.extend([
            "",
            "Ask about a specific destination for its full official record.",
            "",
            "Source: Official Department destination catalogue.",
        ])
        return "\n".join(lines)

    # If the user is clearly asking for a catalogue fact but no destination
    # name matched, fail closed instead of letting the model invent a record.
    if any(term in text for term in _DESTINATION_DETAIL_TERMS) and any(
        term in text for term in ("destination", "place", "attraction", "monastery", "lake", "valley", "park")
    ):
        if not any(term in text for term in ("official", "catalogue", "catalog", "department record")):
            return None
        return (
            "I could not match that place to an official destination record in the Department catalogue. "
            "Please check the spelling or ask using the destination name listed in the catalogue."
        )

    return None


def _format_emergency_response() -> str:
    return (
        "If you are in immediate danger, contact local emergency services or the nearest police, "
        "medical, or road authority now. Move only if it is safe to do so, avoid unstable slopes "
        "and blocked roads, and follow instructions from on-site authorities.\n\n"
        "This chat is not monitored for emergencies and cannot dispatch assistance."
    )


def _format_medical_response() -> str:
    return (
        "I can provide only general travel-safety information, not medical diagnosis or medication "
        "instructions. If altitude symptoms develop, do not continue ascending; rest, seek local "
        "medical advice promptly, and descend if symptoms are severe or worsening.\n\n"
        "Please consult a qualified clinician before travel, especially if you have existing health conditions."
    )


def _format_agency_recommendation_response() -> str:
    return (
        "The Department does not rank or endorse private travel agencies. You may verify a specific "
        "registered agency by name, and I can provide its official directory record when available."
    )


async def _format_exact_official_fact(repo: BaseRepository, message: str) -> str:
    """Return only structured catalogue facts for permit and fee questions."""
    try:
        destinations = await repo.list_destinations()
    except Exception as exc:
        logger.warning("Could not load destination catalogue for official-fact response: %s", exc)
        destinations = []

    question = " ".join(message.casefold().split())
    matches = [destination for destination in destinations if destination.name.casefold() in question]
    if not matches:
        # Visitors commonly transpose or omit a character in a destination name
        # (for example, "gangokt"). Match only against the small, verified
        # catalogue and retain a conservative threshold so an unknown place is
        # never silently mapped to a different destination.
        words = re.findall(r"[a-z]{4,}", question)
        candidates = words + [" ".join(words[index:index + 2]) for index in range(len(words) - 1)]
        catalogue_names = [destination.name.casefold() for destination in destinations]
        matched_names = {
            match
            for candidate in candidates
            for match in get_close_matches(candidate, catalogue_names, n=1, cutoff=0.85)
        }
        matches = [
            destination
            for destination in destinations
            if destination.name.casefold() in matched_names
        ]
    if matches:
        lines = []
        for destination in matches:
            lines.extend([
                f"**{destination.name}**",
                f"- Permit: {destination.permit_info if destination.permit_required and destination.permit_info else ('Required' if destination.permit_required else 'No permit requirement is recorded.')}",
                f"- Entry fee: {destination.entry_fee or 'No entry fee is recorded.'}",
            ])
        lines.extend([
            "",
            "Source: Department destination catalogue. Permit rules, access, and fees can change; confirm before travel.",
        ])
        return "\n".join(lines)

    return (
        "I do not have a verified Department destination record that confirms the current permit or fee "
        "for that place. Please verify it with the Tourism and Civil Aviation Department before travel."
    )


def _official_web_source_note(context: str) -> str:
    """Build a short visitor-facing citation from verified Tavily result URLs."""
    urls = list(dict.fromkeys(
        _canonical_official_source_url(url)
        for url in re.findall(r"Source URL:\s*(https?://[^\s]+)", context)
    ))
    if not urls:
        return ""
    return "\n\nSource: Official Sikkim Tourism website — " + ", ".join(urls[:2])


_OFFICIAL_FACT_QUERY_STOPWORDS = frozenset({
    "about", "access", "allowed", "and", "are", "current", "do", "entry", "fee",
    "fees", "for", "foreign", "from", "have", "how", "i", "is", "me", "need",
    "of", "or", "pass", "permit", "permits", "please", "required", "requirement",
    "the", "to", "tourist", "tourists", "travel", "visit", "what", "with", "you",
})


def _official_fact_topic_terms(message: str) -> set[str]:
    """Extract place-specific terms used to reject unrelated search results."""
    return {
        term
        for term in re.findall(r"[a-z]{3,}", message.casefold())
        if term not in _OFFICIAL_FACT_QUERY_STOPWORDS
    }


def _format_official_web_fallback(context: str, message: str) -> str:
    """Present only relevant official-site excerpts without model-added facts."""
    records = re.findall(
        r"\[OFFICIAL SIKKIM TOURISM WEBSITE\]\s*\n"
        r"Title:\s*(.*?)\s*\n"
        r"Content:\s*(.*?)\s*\n"
        r"Source URL:\s*(https?://\S+)",
        context,
        flags=re.DOTALL,
    )
    if not records:
        return (
            "I found an official Sikkim Tourism page, but could not extract a reliable answer from it. "
            "Please use the official link below to confirm the current requirement."
            + _official_web_source_note(context)
        )

    topic_terms = _official_fact_topic_terms(message)
    fact_markers = ("permit", "pap", "rap", "ilp", "entry fee", "fee", "price", "ticket")
    asks_fact = any(marker in message.casefold() for marker in _OFFICIAL_FACT_TERMS)
    relevant_records = [
        record
        for record in records
        if not topic_terms
        or any(term in f"{record[0]} {record[1]}".casefold() for term in topic_terms)
    ]
    if asks_fact:
        relevant_records = [
            record for record in relevant_records
            if any(marker in f"{record[0]} {record[1]}".casefold() for marker in fact_markers)
        ]
        non_homepage_records = [
            record for record in relevant_records
            if re.sub(r"^https?://(?:www\.)?sikkimtourism\.gov\.in/?$", "", record[2].strip(), flags=re.I)
        ]
        if non_homepage_records:
            relevant_records = non_homepage_records
    if not relevant_records:
        return (
            "I could not find a relevant official Sikkim Tourism page that confirms this current "
            "permit or fee. I will not use an unrelated page as evidence. Please confirm with the "
            "Tourism and Civil Aviation Department before travel."
        )

    lines = [
        "I found the following information on the official Sikkim Tourism website. "
        "Please confirm the current requirement from the linked page before travel.",
    ]
    for title, content, url in relevant_records[:2]:
        excerpt = " ".join(content.split())[:900]
        lines.extend(["", f"**{title.strip()}**", excerpt, f"Source: {_canonical_official_source_url(url)}"])
    return "\n".join(lines)


def _format_unverified_event_response() -> str:
    """Avoid presenting model knowledge as an official, current event schedule."""
    return (
        "I searched for official Sikkim Tourism event information, but I could not find a dated "
        "upcoming schedule for that period. I can help with festival background, but I will not "
        "invent dates or venues and present them as official.\n\n"
        "For newly published notices, check https://sikkimtourism.gov.in/updates/notice before making travel plans."
    )


def _format_official_event_web_fallback(context: str, message: str) -> str:
    """Render published event information from official-site search results.

    Event dates are volatile, so this deliberately quotes only attributable
    Department-page excerpts. It never asks the language model to infer a
    calendar from general knowledge or an uncited search summary.
    """
    records = re.findall(
        r"\[OFFICIAL SIKKIM TOURISM WEBSITE\]\s*\n"
        r"Title:\s*(.*?)\s*\n"
        r"Content:\s*(.*?)\s*\n"
        r"Source URL:\s*(https?://\S+)",
        context,
        flags=re.DOTALL,
    )
    event_markers = ("event", "festival", "celebration", "calendar", "fair", "carnival")
    requested_years = set(re.findall(r"\b20\d{2}\b", message))
    question = message.casefold()
    if not requested_years and any(
        qualifier in question for qualifier in _CURRENT_EVENT_QUALIFIERS
    ):
        # A "next" or "upcoming" answer must be tied to the current or next
        # calendar year. A timeless cultural-description page is not evidence
        # of a scheduled event.
        requested_years = {str(date.today().year), str(date.today().year + 1)}

    def has_scheduled_date(record: tuple[str, str, str]) -> bool:
        """Require a calendar date, not merely a year on an awards page."""
        text = f"{record[0]} {record[1]}"
        months = (
            r"january|february|march|april|may|june|july|august|"
            r"september|october|november|december"
        )
        day_then_month = rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{months})\s+20\d{{2}}\b"
        month_then_day = rf"\b(?:{months})\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,)?\s+20\d{{2}}\b"
        return bool(re.search(day_then_month, text, flags=re.I) or re.search(month_then_day, text, flags=re.I))

    def clean_title(title: str) -> str:
        title = " ".join(title.split()).strip(" -")
        title = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", title)
        return title or "Official Sikkim Tourism information"

    def clean_excerpt(title: str, content: str, *, named_terms: list[str] | None = None) -> str:
        """Remove search-provider metadata accidentally embedded in snippets."""
        content = re.split(r"\s*(?:\[OFFICIAL SIKKIM TOURISM WEBSITE\]|Source URL:)", content, maxsplit=1)[0]
        content = re.sub(rf"^\s*Title:\s*{re.escape(title.strip())}\s*", "", content, flags=re.I)
        content = re.sub(r"^\s*STDC\s*\([^)]*\)\.\s*", "", content, flags=re.I)
        if named_terms:
            lowered = content.casefold()
            positions = [lowered.find(term) for term in named_terms if lowered.find(term) >= 0]
            if positions:
                content = content[min(positions):]
                next_topic = re.search(
                    r"\s+(?:This is the main festival|One of the most famous|Cherry Tea Festival|"
                    r"Pelling Winter Tourism Festival|Bumchu festival|Tendong Lho rum Faat)\b",
                    content[80:],
                    flags=re.I,
                )
                if next_topic:
                    content = content[:80 + next_topic.start()]
        else:
            lowered = content.casefold()
            focus_terms = (
                "pang lhabsol", "losar", "bumchu", "saga dawa", "tendong lho rum faat",
                "cherry tea festival", "pelling winter tourism festival", "festival",
            )
            positions = [lowered.find(term) for term in focus_terms if lowered.find(term) >= 0]
            if positions:
                content = content[min(positions):]
        return " ".join(content.split())[:850]

    def source_label(url: str) -> str:
        url = _canonical_official_source_url(url)
        if re.search(r"^https://(?:www\.)?sikkimtourism\.gov\.in/updates/notice/?$", url, flags=re.I):
            return f"Source: {url}"
        return "Source: Official Sikkim Tourism website."

    def extract_known_festival_names(records_to_scan: list[tuple[str, str, str]]) -> list[str]:
        known_names = (
            "Pang Lhabsol",
            "Saga Dawa",
            "Cherry Tea Festival",
            "Pelling Winter Tourism Festival",
            "Bumchu",
            "Tendong Lho Rum Faat",
            "Indrajatra",
            "Dasain",
            "Losar",
            "Maghe Sankranti",
            "Sonam Lochar",
        )
        found: list[str] = []
        seen: set[str] = set()
        text = " ".join(f"{title} {content}" for title, content, _url in records_to_scan)
        for name in known_names:
            if re.search(rf"\b{re.escape(name)}\b", text, flags=re.I):
                key = name.casefold()
                if key not in seen:
                    found.append(name)
                    seen.add(key)
        return found

    def is_event_page(record: tuple[str, str, str]) -> bool:
        title, content, url = record
        title_and_content = f"{title} {content}".casefold()
        source_path = url.casefold()
        return (
            any(marker in title_and_content for marker in event_markers)
            and (
                any(marker in title.casefold() for marker in event_markers)
                or any(marker in source_path for marker in ("festival", "fair", "newsletter", "notice", "notification"))
            )
        )

    official_event_records = []
    seen_event_urls = set()
    for record in records:
        if not is_event_page(record):
            continue
        url_key = _canonical_official_source_url(record[2]).casefold()
        if url_key in seen_event_urls:
            continue
        seen_event_urls.add(url_key)
        official_event_records.append(record)
    named_terms = [term for term in _NAMED_FESTIVAL_TERMS if term in question]
    if named_terms:
        named_records = [
            record for record in official_event_records
            if any(term in f"{record[0]} {record[1]}".casefold() for term in named_terms)
        ]
        if named_records:
            official_event_records = named_records
    scheduled_event_records = [
        record for record in official_event_records
        if has_scheduled_date(record)
        and (
            not requested_years
            or any(year in f"{record[0]} {record[1]}" for year in requested_years)
        )
    ]
    if scheduled_event_records:
        lines = [
            "I found the following published event information on the official Sikkim Tourism website. "
            "Please confirm dates and availability from the linked page before making travel plans.",
        ]
        for title, content, url in scheduled_event_records[:2]:
            lines.extend(["", f"**{clean_title(title)}**", clean_excerpt(title, content, named_terms=named_terms), source_label(url)])
        return "\n".join(lines)

    if not official_event_records:
        return _format_unverified_event_response()

    if _needs_current_event_verification(message):
        lines = [
            "I found official Sikkim Tourism information about festivals/events, but not a dated upcoming schedule for the period asked. "
            "Use this as background, not as a confirmed current event calendar.",
        ]
        if not named_terms:
            festival_names = extract_known_festival_names(official_event_records)
            if festival_names:
                lines.extend([
                    "",
                    "The official tourism information mentions these festivals/events:",
                    *[f"- {name}" for name in festival_names[:10]],
                    "",
                    source_label(official_event_records[0][2]),
                ])
                return "\n".join(lines)
    else:
        lines = [
            "I found the following official Sikkim Tourism information.",
        ]
    max_records = 1 if named_terms else 2
    for title, content, url in official_event_records[:max_records]:
        lines.extend(["", f"**{clean_title(title)}**", clean_excerpt(title, content, named_terms=named_terms), source_label(url)])
    return "\n".join(lines)


def _needs_festival_information(message: str) -> bool:
    text = message.casefold()
    return any(word in text for word in _CURRENT_EVENT_WORDS) or any(
        term in text for term in _NAMED_FESTIVAL_TERMS
    )


def _format_unverified_festival_response() -> str:
    return (
        "I could not retrieve a relevant official Sikkim Tourism source for that festival right now. "
        "You can still ask for general cultural background, but confirm current dates or venues from "
        "https://sikkimtourism.gov.in/updates/notice before making travel plans."
    )


async def _build_latest_circulars_context(
        repo: BaseRepository,
        *,
        limit: int = 5,
        category: str | None = None,
) -> str:
    """
    Inject the freshest official circulars (road status, cancellation orders,
    notices) directly into the prompt, each stamped with its issue date and
    source link, instead of relying on vector similarity to surface them.

    This mirrors _build_official_destinations_context above: circulars are
    time-sensitive, so we never want the model guessing at freshness — the
    date is always handed to it explicitly, and the model is instructed to
    state it in the answer so the tourist knows exactly how current the
    information is.
    """
    try:
        circulars = await repo.list_circulars(category=category, limit=limit)
    except Exception as exc:
        logger.warning("Could not load circulars for extra_context: %s", exc)
        return ""

    if not circulars:
        return ""

    lines = [
        f"OFFICIAL SIKKIM TOURISM/POLICE CIRCULARS ({len(circulars)} records, most recent first — always "
        "state the issue date when answering from these, since road status "
        "changes daily):"
    ]
    for c in circulars:
        district = f" ({c.district})" if c.district else ""
        lines.append(
            f"- [{c.issue_date}] {c.title}{district} — {c.extracted_text} "
            f"(Source: {c.source_url})"
        )
    return "\n".join(lines)


async def _format_circular_inventory(repo: BaseRepository, message: str) -> str:
    """Return a bounded, exact inventory without placing full OCR into an LLM prompt."""
    category = _inventory_circular_category(message)
    labels = {
        "road_status": "road-status records",
        "cancellation_order": "cancellation orders",
        "tender": "tenders",
    }
    label = labels.get(category, "official notices and circulars")
    try:
        total = await repo.count_circulars(category=category)
        circulars = await repo.list_circulars(
            category=category,
            limit=_CIRCULAR_INVENTORY_SAMPLE_LIMIT,
        )
    except Exception as exc:
        logger.warning("Could not load official circular inventory: %s", exc)
        return (
            "I could not retrieve the official notice inventory at the moment. "
            "Please try again shortly or check https://sikkimtourism.gov.in/updates/notice."
        )

    if total == 0:
        return f"There are currently no {label} on file in the official department records."

    lines = [f"There are **{total}** {label} on file in the official department records."]
    if circulars:
        heading = "The latest records are:" if total <= len(circulars) else (
            f"The latest {len(circulars)} records are listed below:"
        )
        lines.extend(["", heading, ""])
        for circular in circulars:
            district = f" ({circular.district})" if circular.district else ""
            source = (
                f" — [source]({circular.source_url})"
                if circular.source_url.startswith("https://")
                else ""
            )
            lines.append(f"- {circular.issue_date}: **{circular.title}**{district}{source}")
    if total > len(circulars):
        lines.extend([
            "",
            "This is a latest-records sample. Ask about a particular date or title for more detail.",
        ])
    return "\n".join(lines)


async def _format_latest_circulars_response(
        repo: BaseRepository,
        message: str,
        history: list[dict] | None = None,
) -> str:
    """Return latest dated official notices without asking the LLM to infer status."""
    text = " ".join(message.casefold().split())
    category = "road_status" if any(word in text for word in ("road", "nathula", "nathu la", "north sikkim")) else None
    if category is None and history and _looks_like_circular_followup(message):
        for m in history[-4:]:
            recent = " ".join(m.get("content", "").casefold().split())
            if any(word in recent for word in ("road status", "road-status", "road condition", "road closure")):
                category = "road_status"
                break
    requested_district = _extract_district(message)
    requested_day_match = re.search(r"\b([0-3]?\d)(?:st|nd|rd|th)?\b", text)
    try:
        circulars = await repo.list_circulars(category=category, limit=5)
    except Exception as exc:
        logger.warning("Could not load latest circulars: %s", exc)
        return (
            "I could not retrieve the latest official notices at the moment. "
            "Please check https://sikkimtourism.gov.in/updates/notice."
        )

    if not circulars:
        subject = "road-status" if category == "road_status" else "notice"
        return (
            f"I do not currently have a dated official {subject} record that answers this request. "
            "Please check https://sikkimtourism.gov.in/updates/notice or confirm with the local tourism office before travel."
        )

    if category == "road_status" and requested_district:
        matching_circulars = [
            circular for circular in circulars
            if normalize_district(circular.district) == requested_district
            or requested_district.casefold() in f"{circular.title} {circular.extracted_text}".casefold()
        ]
        if matching_circulars:
            circulars = matching_circulars
        else:
            return (
                f"I do not currently have a dated official road-status record for {requested_district} in the latest records on file. "
                "I will not use a record for another district as the current status. "
                "Please check https://sikkimtourism.gov.in/updates/notice or confirm with the local tourism office before travel."
            )
    if category == "road_status" and requested_day_match:
        requested_day = int(requested_day_match.group(1))
        matching_circulars = [
            circular for circular in circulars
            if re.search(rf"\b0?{requested_day}\b", circular.issue_date)
            or re.search(rf"\b0?{requested_day}(?:st|nd|rd|th)?\b", circular.extracted_text or "", flags=re.I)
        ]
        if matching_circulars:
            circulars = matching_circulars
        else:
            return (
                f"I do not currently have a dated official road-status record for the {requested_day_match.group(0)} in the latest records on file. "
                "Please check https://sikkimtourism.gov.in/updates/notice or confirm with the local tourism office before travel."
            )

    lines = [
        "I found these latest dated official records. I will not infer that a road is open or closed unless a record says so clearly.",
        "",
    ]
    for circular in circulars:
        source = (
            f" — [source]({circular.source_url})"
            if circular.source_url.startswith("https://")
            else ""
        )
        excerpt_text = " ".join((circular.extracted_text or "").split())
        excerpt = excerpt_text[:420]
        if requested_district and excerpt_text:
            for alias in district_filter_values(requested_district):
                match = re.search(rf"\b{re.escape(alias)}\b", excerpt_text, flags=re.I)
                if match:
                    start = max(0, match.start() - 120)
                    excerpt = excerpt_text[start:start + 520]
                    break
        lines.append(f"- {circular.issue_date}: **{circular.title}**{source}")
        if excerpt:
            lines.append(f"  {excerpt}")

    lines.extend([
        "",
        "Source: Official Tourism and Civil Aviation Department notices. Check the linked notice page before travel because road status can change quickly.",
    ])
    return "\n".join(lines)


def _format_verified_agency(agency) -> str:
    """Render a verified MySQL agency row without an LLM rewriting its facts."""
    lines = [f"**{agency.name}**"]
    fields = (
        ("Registration No.", agency.registration_number),
        ("Proprietor", agency.proprietor),
        ("District", agency.district),
        ("Grade", agency.grade),
        ("Contact", agency.contact),
        ("Email / Website", agency.email_or_website),
        ("Address", agency.address),
        ("Date of Issue", agency.date_of_issue),
        ("Renewed Upto", agency.renewed_upto),
    )
    for label, value in fields:
        if value not in (None, ""):
            lines.append(f"- {label}: {value}")
    if len(lines) == 1:
        lines.append("- No additional official details are currently on file.")
    synced_at = getattr(agency, "synced_at", None)
    if synced_at:
        lines.extend(["", f"Source: Official department travel-agency directory (record synced {synced_at:%Y-%m-%d} UTC)."])
    else:
        lines.extend(["", "Source: Official department travel-agency directory."])
    return "\n".join(lines)


def _format_agency_suggestions(candidates: list, *, query_name: str = "") -> str:
    """Numbered shortlist so the tourist can pick without guessing for them."""
    lines = [
        "I found more than one registered travel agency that could match"
        + (f' “{query_name}”' if query_name else "")
        + ". Please reply with the **number** or the **exact name** of the one you mean:"
    ]
    for i, agency in enumerate(candidates[:5], start=1):
        district = f" — {agency.district}" if agency.district else ""
        lines.append(f"{i}. **{agency.name}**{district}")
    lines.append(
        "\nOnce you choose, I will share the official registration number, contact, "
        "and address from the department directory."
    )
    return "\n".join(lines)


def _format_agency_resolution_failure(resolution) -> str:
    if resolution.status == "ambiguous" and resolution.candidates:
        return _format_agency_suggestions(
            resolution.candidates,
            query_name=resolution.query_name or "",
        )
    return (
        "I could not find a matching travel agency in the official department directory, "
        "so I will not invent a registration number or contact details. "
        "Please check the spelling or give me the district it is registered in."
    )


_AGENCY_SUGGESTION_MARKER = "Please reply with the **number** or the **exact name**"


def _previous_agency_suggestions(history: list[dict]) -> list[str] | None:
    """
    If the last assistant turn offered a numbered agency shortlist, return
    those exact names (in order). Used so a follow-up like "1" or "yes, the
    first one" can be resolved without the tourist retyping the full name.
    """
    for msg in reversed(history or []):
        if msg.get("role") != "assistant":
            continue
        content = msg.get("content") or ""
        if _AGENCY_SUGGESTION_MARKER not in content:
            return None
        names: list[str] = []
        for match in re.finditer(
                r"^\s*\d+\.\s+\*\*(.+?)\*\*",
                content,
                flags=re.MULTILINE,
        ):
            names.append(match.group(1).strip())
        return names or None
    return None


def _select_from_agency_suggestions(message: str, suggested_names: list[str]) -> str | None:
    """Map a short tourist reply onto one of the previously offered names."""
    text = " ".join((message or "").strip().split())
    if not text or not suggested_names:
        return None

    lower = text.casefold()

    num = re.fullmatch(r"[#]?\s*([1-5])\s*[.)]?", text.strip())
    if num:
        idx = int(num.group(1)) - 1
        if 0 <= idx < len(suggested_names):
            return suggested_names[idx]

    ordinals = {
        "first": 0, "1st": 0, "one": 0,
        "second": 1, "2nd": 1, "two": 1,
        "third": 2, "3rd": 2, "three": 2,
        "fourth": 3, "4th": 3,
        "fifth": 4, "5th": 4,
    }
    for word, idx in ordinals.items():
        if re.search(rf"\b{word}\b", lower) and idx < len(suggested_names):
            return suggested_names[idx]

    if lower in {"yes", "yeah", "yep", "ok", "okay", "that one", "this one"} and len(suggested_names) == 1:
        return suggested_names[0]

    from app.services.entity_resolver import normalize_entity_name, _score

    best_name = None
    best = 0.0
    for name in suggested_names:
        if normalize_entity_name(text) == normalize_entity_name(name):
            return name
        s = _score(text, name)
        if s > best:
            best = s
            best_name = name
    if best >= 0.72:
        return best_name
    return None


_OFFICIAL_LINKS_CONTEXT = (
    "OFFICIAL SIKKIM TOURISM DEPARTMENT LINKS (always prefer these exact HTTPS URLs):\n"
    "- Official website: https://sikkimtourism.gov.in\n"
    "- Notices and updates: https://sikkimtourism.gov.in/updates/notice\n"
    "Never invent government URLs. Never use http:// for these hosts."
)


def _canonical_official_source_url(url: str) -> str:
    """Keep visitor-facing official tourism links on HTTPS."""
    return re.sub(
        r"^http://((?:www\.)?sikkimtourism\.gov\.in)",
        r"https://\1",
        url.strip(),
        flags=re.I,
    )


async def _build_agency_context(repo: BaseRepository, message: str, *, limit: int = 5) -> str:
    try:
        agencies = await repo.search_travel_agencies(message, limit=limit)
    except Exception as exc:
        logger.warning("Could not search travel agencies for extra_context: %s", exc)
        return ""

    if not agencies:
        return ""

    lines = [
        "REGISTERED SIKKIM TRAVEL AGENCIES matching this question (official "
        "department directory — prefer this over any other source for "
        "agency name, contact, email, or registration details):"
    ]
    for a in agencies:
        district = f", {a.district}" if a.district else ""
        contact = a.contact or "not on file"
        email = a.email_or_website or "not on file"
        grade = f", grade {a.grade}" if a.grade else ""
        lines.append(
            f"- {a.name} (Reg. No. {a.registration_number}{district}{grade}) — "
            f"Proprietor: {a.proprietor or 'not on file'}. Contact: {contact}. "
            f"Email/Website: {email}. Address: {a.address or 'not on file'}."
        )
    return "\n".join(lines)


async def _build_agency_directory_context(
        repo: BaseRepository, message: str, *, sample_limit: int = 15,
) -> str:
    """
    "How many / list all agencies [in <district>]" path — uses a real
    COUNT query so the model states the true total, instead of running
    the same 5-result fuzzy search used for single-agency lookups and
    presenting that truncated sample as if it were everything.
    """
    district = _extract_district(message)
    try:
        total = await repo.count_travel_agencies(district=district)
        sample = await repo.list_travel_agencies(district=district, limit=sample_limit)
    except Exception as exc:
        logger.warning("Could not load travel agency directory for extra_context: %s", exc)
        return ""

    if total == 0:
        return ""

    scope = f" in {district}" if district else ""
    lines = [
        f"REGISTERED SIKKIM TRAVEL AGENCIES{scope}: {total} agencies are on file in the "
        f"official department directory — state this exact total ({total}) when answering "
        f"'how many' questions, do not undercount it to the sample below. Showing the first "
        f"{len(sample)} alphabetically as examples; tell the user they can ask about any "
        f"specific agency by name for its full contact details:"
    ]
    for a in sample:
        lines.append(f"- {a.name} (Reg. No. {a.registration_number})")
    return "\n".join(lines)


async def _format_agency_directory_response(
        repo: BaseRepository, message: str, *, sample_limit: int = 15,
) -> str:
    """Return exact registered-agency counts/lists without an LLM."""
    district = _extract_district(message)
    text = " ".join(message.casefold().split())
    wants_full_details = any(
        phrase in text
        for phrase in ("full detail", "full details", "contact", "contacts", "address", "phone", "email")
    )
    try:
        total = await repo.count_travel_agencies(district=district)
        effective_limit = total if wants_full_details and district and total <= 25 else sample_limit
        sample = await repo.list_travel_agencies(district=district, limit=effective_limit)
    except Exception as exc:
        logger.warning("Could not load travel agency directory: %s", exc)
        return (
            "I could not retrieve the official travel-agency directory at the moment. "
            "Please try again shortly."
        )

    scope = f" in {district}" if district else " in Sikkim"
    if total == 0:
        return f"I do not currently have any registered travel agencies on file{scope}."

    lines = [
        f"There are **{total}** registered travel agencies{scope} in the official department directory."
    ]
    if any(word in text for word in ("list", "all", "show", "which")) and sample:
        if wants_full_details and district and total <= 25:
            lines.extend(["", "Official records:"])
            for agency in sample:
                lines.append(f"- **{agency.name}**")
                fields = (
                    ("Registration No.", agency.registration_number),
                    ("Proprietor", agency.proprietor),
                    ("Grade", agency.grade),
                    ("Contact", agency.contact),
                    ("Email / Website", agency.email_or_website),
                    ("Address", agency.address),
                    ("Date of Issue", agency.date_of_issue),
                    ("Renewed Upto", agency.renewed_upto),
                )
                added_detail = False
                for label, value in fields:
                    if value not in (None, ""):
                        lines.append(f"  - {label}: {value}")
                        added_detail = True
                if not added_detail:
                    lines.append("  - No additional official details are currently on file.")
        else:
            lines.extend(["", f"First {len(sample)} records alphabetically:"])
            for agency in sample:
                district_label = f" — {agency.district}" if agency.district and not district else ""
                lines.append(f"- **{agency.name}**{district_label} (Reg. No. {agency.registration_number})")
        if total > len(sample):
            lines.extend([
                "",
                "This is a bounded sample. Ask for a specific agency name to get its full official record.",
            ])

    lines.extend(["", "Source: Official department travel-agency directory."])
    return "\n".join(lines)


async def _build_official_destinations_context(repo: BaseRepository) -> str:
    """
    Build a compact, complete summary of every destination in the Department's
    official records and hand it to the LLM as `extra_context` on every turn.

    Why this exists: the RAG step (`_retrieve_context` in rag_chain.py) only
    pulls the top-4 semantically similar destinations from the vector store.
    That's fine for a narrow question ("tell me about Yumthang Valley") but it
    silently drops destinations for broad questions like "what places can I
    visit in Sikkim?" or "list all destinations" — the model would only ever
    see 4 of them and could present an incomplete answer as if it were
    complete. The full destinations list is small (a few dozen records at
    most) and cheap to include in full on every request, so instead of hoping
    similarity search happens to surface everything relevant, we always give
    the model the complete, authoritative list and let it decide what's
    relevant to the question. This is what previously made "FIX 3/FIX 4" in
    rag_chain.py a no-op — the parameter existed but nothing ever populated it.
    """
    try:
        destinations = await repo.list_destinations()
    except Exception as exc:
        logger.warning("Could not load destinations for extra_context: %s", exc)
        return ""

    if not destinations:
        return ""

    lines = ["OFFICIAL SIKKIM TOURISM DEPARTMENT — FULL DESTINATIONS LIST:"]
    for d in destinations:
        permit = f"Permit required ({d.permit_info})" if d.permit_required else "No permit required"
        entry_fee = d.entry_fee or "Free"
        lines.append(
            f"- {d.name} ({d.district}, category: {d.category}): {d.description} "
            f"Best time: {d.best_time}. Entry fee: {entry_fee}. {permit}."
        )
    return "\n".join(lines)


async def _build_district_destinations_context(repo: BaseRepository, district: str) -> str:
    """
    Full, exact destinations list for one district, pulled directly from
    MySQL — not vector similarity.

    Why this exists: without it, a district question relies entirely on
    _retrieve_context()'s top-4 Qdrant similarity search. Gangtok (the
    capital, referenced throughout most destinations' "how to reach" text)
    dominates that embedding space and reliably wins the top-4 ranking, so
    it "just works". A less-represented district's destinations are
    correct and complete in MySQL but simply don't win that ranking, so
    the model only ever sees a partial/fuzzy slice of them and gives an
    incomplete answer even though the exact data exists. This mirrors
    _build_agency_directory_context and _build_latest_circulars_context,
    which already solve the identical problem for agencies and circulars
    by querying MySQL directly instead of gambling on similarity search.
    """
    try:
        destinations = await repo.list_destinations()
    except Exception as exc:
        logger.warning("Could not load district destinations for extra_context: %s", exc)
        return ""

    matches = [d for d in destinations if normalize_district(d.district) == district]
    if not matches:
        return ""

    lines = [
        f"OFFICIAL SIKKIM TOURISM DEPARTMENT — FULL DESTINATIONS LIST FOR {district.upper()} "
        f"({len(matches)} records — this is the complete, exact set on file for this district, "
        "not a partial sample; answer from this rather than a guess at what might be missing):"
    ]
    for d in matches:
        permit = f"Permit required ({d.permit_info})" if d.permit_required else "No permit required"
        entry_fee = d.entry_fee or "Free"
        lines.append(
            f"- {d.name} ({d.district}, category: {d.category}): {d.description} "
            f"Best time: {d.best_time}. Entry fee: {entry_fee}. {permit}. "
            f"How to reach: {d.how_to_reach}"
        )
    return "\n".join(lines)


async def _build_named_destinations_context(repo: BaseRepository, message: str) -> str:
    """Inject exact official records for destinations explicitly named by a visitor."""
    try:
        destinations = await repo.list_destinations()
    except Exception as exc:
        logger.warning("Could not load named destinations for extra_context: %s", exc)
        return ""

    question = " ".join(message.casefold().split())
    matches = [
        destination
        for destination in destinations
        if destination.name.casefold() in question
    ]
    if not matches:
        return ""

    lines = [
        "OFFICIAL SIKKIM TOURISM DEPARTMENT — NAMED DESTINATION RECORDS "
        "(these are the exact places named by the visitor):"
    ]
    for destination in matches:
        permit = (
            f"Permit required ({destination.permit_info})"
            if destination.permit_required
            else "No permit required"
        )
        lines.append(
            f"- {destination.name} ({destination.district}, category: {destination.category}): "
            f"{destination.description} Best time: {destination.best_time}. "
            f"Entry fee: {destination.entry_fee or 'Free'}. {permit}. "
            f"How to reach: {destination.how_to_reach}"
        )
    return "\n".join(lines)


def _sse_response(event_generator):
    """Create a non-cacheable SSE response with proxy-safe streaming headers."""
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _replay_completed_turn(
        repo: BaseRepository, conversation_id: str, user_message_id: str
):
    """Return the saved assistant answer for a completed idempotent retry."""
    messages = await repo.list_messages(conversation_id)
    for index, message in enumerate(messages):
        if message.id != user_message_id:
            continue
        if index + 1 < len(messages) and messages[index + 1].role == "assistant":
            answer = messages[index + 1].content

            async def replay():
                yield f"data: {json.dumps({'text': answer})}\n\n"
                yield "data: [DONE]\n\n"

            return _sse_response(replay())
        break
    return None


@router.post("", response_model=ConversationResponse)
@limiter.limit("20/minute")
async def create_conversation(
        request: Request,
        repo: BaseRepository = Depends(get_repo),
):
    access_token = secrets.token_urlsafe(32)
    access_token_hash = hashlib.sha256(access_token.encode("utf-8")).hexdigest()
    conv = await repo.create_conversation(access_token_hash)
    return ConversationResponse(
        conversation=conv,
        messages=[],
        access_token=access_token,
    )


@router.get("/{conversation_id}", response_model=ConversationResponse)
@limiter.limit("60/minute")
async def get_conversation(
        conversation_id: str,
        request: Request,
        repo: BaseRepository = Depends(get_repo),
):
    if not _is_valid_uuid(conversation_id):
        raise HTTPException(status_code=400, detail="Invalid conversation ID format.")

    access_token = request.headers.get("X-Conversation-Token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Conversation access token required.")

    conv = await repo.get_conversation(conversation_id, access_token)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    messages = await repo.list_messages(conversation_id)
    return ConversationResponse(conversation=conv, messages=messages)


@router.post("/{conversation_id}/chat")
@limiter.limit("30/minute")  # Rate limit: 30 requests per minute per IP
async def send_message(
        conversation_id: str,
        body: ChatRequest,
        request: Request,
        repo: BaseRepository = Depends(get_repo),
):
    if not _is_valid_uuid(conversation_id):
        raise HTTPException(status_code=400, detail="Invalid conversation ID format.")

    access_token = request.headers.get("X-Conversation-Token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Conversation access token required.")

    conv = await repo.get_conversation(conversation_id, access_token)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # A browser can retry after a network interruption even though the first
    # request reached us. Replaying a completed turn avoids duplicate user
    # messages and duplicate model/provider charges. A still-running turn is
    # rejected rather than starting a second generation for the same id.
    if body.client_message_id:
        existing = await repo.get_message_by_client_id(
            conversation_id, body.client_message_id
        )
        if existing:
            replay = await _replay_completed_turn(repo, conversation_id, existing.id)
            if replay:
                return replay
            raise HTTPException(
                status_code=409,
                detail="This message is already being processed. Please retry shortly.",
            )

    # Determine whether this is a vision turn.
    has_image = bool(
        body.image_base64
        and body.image_mime_type
        and len(body.image_base64) > 0
    )

    # 1. Persist user message (store text only — never persist raw image data).
    try:
        await repo.add_message(
            conversation_id,
            "user",
            body.message,
            client_message_id=body.client_message_id,
        )
    except Exception:
        # The initial lookup and insert are separate transactions. Concurrent
        # retries can both observe no row, then one loses the database's unique
        # constraint race. Treat that as idempotency rather than a 500.
        if body.client_message_id:
            existing = await repo.get_message_by_client_id(
                conversation_id, body.client_message_id
            )
            if existing:
                replay = await _replay_completed_turn(repo, conversation_id, existing.id)
                if replay:
                    return replay
                raise HTTPException(
                    status_code=409,
                    detail="This message is already being processed. Please retry shortly.",
                ) from None
        raise

    # 2. Build conversation history (all messages before this one)
    all_messages = await repo.list_messages(conversation_id)
    history = _messages_to_history(all_messages)

    # 3. Stream the AI response via SSE.
    assistant_chunks: list[str] = []

    async def event_generator():
        nonlocal assistant_chunks
        try:
            # High-risk structured agency lookups are answered deterministically
            # from MySQL.  Do not send them through the LLM: registration numbers,
            # phone numbers and addresses are database facts, not language-model
            # facts.
            if not has_image:
                if _needs_contact_directory_guidance(body.message):
                    deterministic = _format_contact_directory_guidance()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_emergency_response(body.message):
                    deterministic = _format_emergency_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_transaction_response(body.message):
                    deterministic = _format_transaction_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_off_topic_response(body.message):
                    deterministic = _format_off_topic_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_medical_response(body.message):
                    deterministic = _format_medical_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_agency_recommendation(body.message):
                    deterministic = _format_agency_recommendation_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_agency_directory_listing(body.message, history):
                    deterministic = await _format_agency_directory_response(repo, body.message)
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if await _needs_permit_overview_response(repo, body.message):
                    deterministic = _format_permit_overview_response()
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                official_fact_message = await _resolve_contextual_official_fact_message(
                    repo, body.message, history
                )
                if official_fact_message:
                    deterministic = await _format_exact_official_fact(repo, official_fact_message)
                    if deterministic.startswith("I do not have a verified Department destination record"):
                        official_web_context = await search_official_sikkim_tourism(official_fact_message)
                        if official_web_context:
                            deterministic = _format_official_web_fallback(
                                official_web_context,
                                official_fact_message,
                            )
                            assistant_chunks.append(deterministic)
                            yield f"data: {json.dumps({'text': deterministic})}\n\n"
                            return

                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                destination_response = await _format_destination_catalog_response(repo, body.message)
                if destination_response:
                    assistant_chunks.append(destination_response)
                    yield f"data: {json.dumps({'text': destination_response})}\n\n"
                    return

                # Follow-up: tourist is choosing from a numbered shortlist we
                # offered on the previous turn ("1", "first one", partial name).
                suggested = _previous_agency_suggestions(history)
                if suggested:
                    chosen_name = _select_from_agency_suggestions(body.message, suggested)
                    if chosen_name:
                        try:
                            resolution = await resolve_travel_agency(
                                repo,
                                chosen_name,
                                district=_extract_district(body.message),
                            )
                            if resolution.status == "matched" and resolution.agency:
                                deterministic = _format_verified_agency(resolution.agency)
                            else:
                                agency = await repo.get_travel_agency_by_name(chosen_name)
                                if agency:
                                    deterministic = _format_verified_agency(agency)
                                else:
                                    deterministic = _format_agency_resolution_failure(resolution)
                            assistant_chunks.append(deterministic)
                            yield f"data: {json.dumps({'text': deterministic})}\n\n"
                            return
                        except Exception as agency_exc:
                            logger.warning(
                                "Agency shortlist follow-up failed; falling back: %s",
                                agency_exc,
                            )

                if _needs_agency_lookup(body.message) and not _needs_agency_directory_listing(
                        body.message, history
                ):
                    try:
                        resolution = await resolve_travel_agency(
                            repo,
                            body.message,
                            district=_extract_district(body.message),
                        )
                        if resolution.status == "matched" and resolution.agency:
                            deterministic = _format_verified_agency(resolution.agency)
                        else:
                            deterministic = _format_agency_resolution_failure(resolution)
                        assistant_chunks.append(deterministic)
                        yield f"data: {json.dumps({'text': deterministic})}\n\n"
                        return
                    except Exception as agency_exc:
                        logger.warning(
                            "Deterministic agency lookup failed; falling back to RAG: %s",
                            agency_exc,
                        )

                # Events are time-sensitive public information. Until the
                # application has a verified event-record feed, query only the
                # Department website before answering. Never let a language
                # model turn general knowledge into an official-looking
                # calendar, date, or venue recommendation.
                if _needs_current_event_verification(body.message):
                    official_web_context = await search_official_sikkim_tourism(
                        _official_event_search_query(body.message)
                    )
                    deterministic = (
                        _format_official_event_web_fallback(official_web_context, body.message)
                        if official_web_context
                        else _format_unverified_event_response()
                    )
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_festival_information(body.message):
                    official_web_context = await search_official_sikkim_tourism(
                        _official_event_search_query(body.message)
                    )
                    if official_web_context:
                        deterministic = _format_official_event_web_fallback(
                            official_web_context,
                            body.message,
                        )
                        assistant_chunks.append(deterministic)
                        yield f"data: {json.dumps({'text': deterministic})}\n\n"
                        return

                # Inventory questions are also answered directly from MySQL.
                # Full circular OCR can be lengthy and is unnecessary when a
                # visitor asks for a count or a list of notices; returning a
                # bounded, dated inventory keeps the reply accurate and fast.
                if _needs_circular_inventory(body.message):
                    deterministic = await _format_circular_inventory(repo, body.message)
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

                if _needs_latest_circulars(body.message, history):
                    deterministic = await _format_latest_circulars_response(repo, body.message, history)
                    assistant_chunks.append(deterministic)
                    yield f"data: {json.dumps({'text': deterministic})}\n\n"
                    return

            if has_image:
                # Vision path — Gemini multimodal
                stream = stream_rag_response_with_image(
                    user_message=body.message,
                    history_messages=history,
                    image_base64=body.image_base64,       # type: ignore[arg-type]
                    image_mime_type=body.image_mime_type, # type: ignore[arg-type]
                )
            else:
                # Text path — Groq / Llama. Broad catalogue questions get the
                # full official list; "latest update" questions get the
                # freshest circulars; focused questions use only RAG results.
                context_parts = [_OFFICIAL_LINKS_CONTEXT]
                if _needs_full_destination_context(body.message):
                    dest_context = await _build_official_destinations_context(repo)
                    if dest_context:
                        context_parts.append(dest_context)
                else:
                    named_context = await _build_named_destinations_context(repo, body.message)
                    if named_context:
                        context_parts.append(named_context)
                    # No broad "list everything" phrase, but if the message
                    # names a specific district, give the model that
                    # district's exact MySQL records directly instead of
                    # leaving it to vector similarity search, which
                    # under-represents smaller districts relative to
                    # Gangtok. See _build_district_destinations_context.
                    district = _extract_district(body.message)
                    if district:
                        district_context = await _build_district_destinations_context(repo, district)
                        if district_context:
                            context_parts.append(district_context)
                if _needs_latest_circulars(body.message, history):
                    circular_context = await _build_latest_circulars_context(
                        repo,
                        limit=5,
                    )
                    if circular_context:
                        context_parts.append(circular_context)
                if _needs_agency_directory_listing(body.message, history):
                    directory_context = await _build_agency_directory_context(repo, body.message)
                    if directory_context:
                        context_parts.append(directory_context)
                elif _needs_agency_lookup(body.message):
                    agency_context = await _build_agency_context(repo, body.message)
                    if agency_context:
                        context_parts.append(agency_context)
                extra_context = "\n\n".join(context_parts)
                stream = stream_rag_response(body.message, history, extra_context)

            async for chunk in stream:
                assistant_chunks.append(chunk)
                yield f"data: {json.dumps({'text': chunk})}\n\n"

        except Exception as exc:
            logger.exception("SSE stream error: %s", exc)
            friendly = (
                "Sorry, I ran into a problem answering that just now. "
                "Please try again in a moment."
            )
            assistant_chunks.clear()
            assistant_chunks.append(friendly)
            yield f"data: {json.dumps({'text': friendly})}\n\n"
        finally:
            full_response = "".join(assistant_chunks)
            if full_response:
                try:
                    await repo.add_message(conversation_id, "assistant", full_response)
                except Exception:
                    # The response was already delivered. Do not turn a storage
                    # outage into a malformed stream or retry the model call.
                    logger.exception("Failed to persist assistant response")
                if settings.enable_followups:
                    # Best-effort and opt-in: this is an extra LLM call.
                    try:
                        suggestions = await generate_followups(body.message, full_response)
                        if suggestions:
                            yield f"data: {json.dumps({'suggestions': suggestions})}\n\n"
                    except Exception:
                        logger.exception("Failed to generate follow-up suggestions")
            yield "data: [DONE]\n\n"

    return _sse_response(event_generator())
