"""Deterministic entity resolution for database-backed chatbot facts.

The LLM should explain verified records, not decide which database entity a
user meant.  This module extracts a likely travel-agency name, resolves it
against the repository, assigns a conservative confidence score, and returns
one of three states: matched, ambiguous, or not_found.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.database.base import BaseRepository
from app.districts import normalize_district
from app.models.schemas import TravelAgency


@dataclass(slots=True)
class AgencyResolution:
    status: str  # matched | ambiguous | not_found
    query_name: str
    agency: TravelAgency | None = None
    confidence: float = 0.0
    candidates: list[TravelAgency] | None = None


_PREFIX_RE = re.compile(r"^\s*(?:m\s*/\s*s|m/s|ms)\.?\s+", re.I)
_SUFFIX_RE = re.compile(
    r"(?:\s+(?:registered\s+)?travel\s+agency|\s+travel\s+agency|\s+tour\s+operator|\s+agency|\s+operator)\s*[?.!]*$",
    re.I,
)

_REQUEST_PREFIXES = (
    r"^can you (?:please )?", r"^could you (?:please )?", r"^would you (?:please )?",
    r"^please ", r"^tell me ", r"^give me ", r"^show me ", r"^provide me ",
    r"^i want to know ", r"^i need (?:the )?",
)


def normalize_entity_name(value: str) -> str:
    """Normalize a business name for comparison without losing identity words."""
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = value.replace("&", " and ")
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def extract_agency_name(message: str) -> str:
    """Extract the likely named agency from a natural-language question."""
    text = " ".join((message or "").strip().split())
    if not text:
        return ""

    quoted = re.search(r"[\"'“”](.+?)[\"'“”]", text)
    if quoted:
        candidate = quoted.group(1).strip()
    else:
        candidate = text
        for pattern in _REQUEST_PREFIXES:
            candidate = re.sub(pattern, "", candidate, flags=re.I)

        # Prefer the text after an information-intent preposition.
        candidate = re.sub(
            r"^.*?\b(?:details?|information|info|contact(?:\s+details?)?|phone(?:\s+number)?|email(?:\s+address)?|registration(?:\s+number)?|reg(?:istration)?\.?\s*no\.?)\s+(?:of|for|about)\s+",
            "", candidate, flags=re.I, count=1,
        )
        candidate = re.sub(r"^about\s+", "", candidate, flags=re.I)

    candidate = _PREFIX_RE.sub("", candidate).strip(" .,!?:;-")
    candidate = _SUFFIX_RE.sub("", candidate).strip(" .,!?:;-")
    candidate = re.sub(r"\s+", " ", candidate)

    # Remove a trailing request phrase if it survived the extraction.
    candidate = re.sub(r"\s+(?:please|thanks|thank you)$", "", candidate, flags=re.I).strip()
    return candidate


def _score(query: str, name: str) -> float:
    q = normalize_entity_name(query)
    n = normalize_entity_name(name)
    if not q or not n:
        return 0.0
    if q == n:
        return 1.0

    qt = set(q.split())
    nt = set(n.split())
    if qt == nt:
        return 0.98
    if qt and qt.issubset(nt):
        return 0.94
    if nt and nt.issubset(qt):
        return 0.90

    seq = SequenceMatcher(None, q, n).ratio()
    overlap = len(qt & nt) / max(len(qt), 1)
    return round(0.65 * seq + 0.35 * overlap, 4)


async def resolve_travel_agency(
        repo: BaseRepository,
        message: str,
        *,
        district: str | None = None,
        candidate_limit: int = 25,
) -> AgencyResolution:
    """Resolve a named agency without asking an LLM to choose the record."""
    query_name = extract_agency_name(message)
    if not query_name or len(query_name) < 2:
        return AgencyResolution(status="not_found", query_name=query_name)

    # First choice: deterministic exact database name lookup.
    exact = await repo.get_travel_agency_by_name(query_name, district=district)
    if exact:
        return AgencyResolution(status="matched", query_name=query_name, agency=exact, confidence=1.0)

    # If district-specific exact lookup missed, an exact global match is still
    # useful; only accept it automatically when the user's district does not
    # contradict the record.
    global_exact = await repo.get_travel_agency_by_name(query_name)
    if global_exact:
        if district and normalize_district(global_exact.district) != normalize_district(district):
            return AgencyResolution(status="ambiguous", query_name=query_name, candidates=[global_exact])
        return AgencyResolution(status="matched", query_name=query_name, agency=global_exact, confidence=1.0)

    candidates = await repo.search_travel_agencies(query_name, limit=candidate_limit)

    # Normalize punctuation/ampersands so harmless variants such as
    # "D and D Tours & Travels" and "D & D Tours & Travels" resolve to the
    # same registered entity when the repository search can surface it.
    normalized_query = normalize_entity_name(query_name)
    for candidate in candidates:
        if normalize_entity_name(candidate.name) == normalized_query:
            return AgencyResolution(status="matched", query_name=query_name, agency=candidate, confidence=0.99)

    ranked = sorted(
        ((round(_score(query_name, a.name), 4), a) for a in candidates),
        key=lambda item: (-item[0], item[1].name.casefold()),
    )
    if not ranked:
        return AgencyResolution(status="not_found", query_name=query_name)

    # Apply district as a ranking preference, never as a reason to invent a
    # match.  This keeps a district supplied by the user useful without making
    # fuzzy matching overconfident.
    if district:
        target = normalize_district(district)
        ranked.sort(key=lambda item: (-item[0], normalize_district(item[1].district) != target, item[1].name.casefold()))

    best_score, best = ranked[0]
    second_score = ranked[1][0] if len(ranked) > 1 else 0.0

    # Exact-ish match: safe enough for automatic deterministic answering.
    if best_score >= 0.94 and (best_score - second_score >= 0.06 or second_score < 0.90):
        return AgencyResolution(status="matched", query_name=query_name, agency=best, confidence=best_score)

    # Never guess when several records are close.
    close = [a for score, a in ranked if score >= max(0.72, best_score - 0.08)][:5]
    if best_score >= 0.72:
        return AgencyResolution(status="ambiguous", query_name=query_name, confidence=best_score, candidates=close)

    return AgencyResolution(status="not_found", query_name=query_name, confidence=best_score, candidates=[a for _, a in ranked[:5]])