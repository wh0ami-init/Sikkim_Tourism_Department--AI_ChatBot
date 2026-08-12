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
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Keep model prompts bounded as a conversation grows.  Full history was sent
# on every request, eventually causing slow responses, provider token-limit
# failures, and unnecessary cost.  The complete conversation remains stored
# in the repository; this only limits what is placed in a single prompt.
MAX_HISTORY_MESSAGES = 16

# Only broad catalogue questions need every destination in the prompt. Sending
# it on narrow questions wastes tokens and noticeably delays the first answer.
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

# Questions matching these phrases get the freshest circulars injected
# directly — same reasoning as _FULL_CATALOG_PHRASES above: this is
# important enough that we don't want to gamble on vector similarity
# happening to surface it.
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
    "registration number", "regd no", "reg no", "reg. no",
    "email for", "email of", "email address of", "email address for",
    "contact for", "contact of", "contact details of", "contact number of",
    "phone number for", "phone number of", "agency email", "agency contact",
    "details of", "full details", "full data of", "info of", "information of",
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
    if "agency" in text or "agencies" in text:
        return True
    has_entity_word = any(w in text for w in _AGENCY_ENTITY_WORDS)
    has_intent_word = any(w in text for w in _AGENCY_INTENT_WORDS)
    if has_entity_word and has_intent_word:
        return True
    if (
            has_entity_word
            and len(text.split()) <= 8
            and not any(w in text for w in _AGENCY_GENERIC_WORDS)
    ):
        return True
    return False


_AGENCY_LISTING_PHRASES = (
    "list all", "list agencies", "list travel agencies", "list the agencies",
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


def _needs_latest_circulars(message: str, history: list[dict] | None = None) -> bool:
    """
    True if the current message matches a road-status/circular keyword,
    OR if the last couple of turns in this conversation were already about
    circulars — so a bare follow-up like "okay of 27th" or "full details"
    still gets the real circular data instead of falling through to the
    model's general knowledge (which was inventing fake dates/roads).
    """
    text = " ".join(message.lower().split())
    if any(phrase in text for phrase in _LATEST_UPDATE_PHRASES):
        return True
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
    if resolution.candidates:
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
    await repo.add_message(
        conversation_id,
        "user",
        body.message,
        client_message_id=body.client_message_id,
    )

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
                inventory = _needs_circular_inventory(body.message)
                if _needs_latest_circulars(body.message, history) or inventory:
                    road_status_inventory = inventory and "road" in body.message.lower()
                    circular_context = await _build_latest_circulars_context(
                        repo,
                        limit=250 if inventory else 5,
                        category="road_status" if road_status_inventory else None,
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
                await repo.add_message(conversation_id, "assistant", full_response)
                if settings.enable_followups:
                    # Best-effort and opt-in: this is an extra LLM call.
                    suggestions = await generate_followups(body.message, full_response)
                    if suggestions:
                        yield f"data: {json.dumps({'suggestions': suggestions})}\n\n"
            yield "data: [DONE]\n\n"

    return _sse_response(event_generator())