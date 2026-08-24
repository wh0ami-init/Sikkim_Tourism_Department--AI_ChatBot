"""Regression tests for deterministic travel-agency resolution."""

import pytest

from app.models.schemas import TravelAgency
from app.services.entity_resolver import resolve_travel_agency


class Repository:
    async def get_travel_agency_by_name(self, _name, district=None):
        return None

    async def search_travel_agencies(self, _query, limit=25):
        return [
            TravelAgency(name="Alpha Tours", registration_number="SK/TEST/001"),
            TravelAgency(name="Beta Travel", registration_number="SK/TEST/002"),
        ][:limit]


@pytest.mark.asyncio
async def test_low_confidence_agency_match_returns_not_found_instead_of_none():
    resolution = await resolve_travel_agency(Repository(), "unrelated operator")

    assert resolution.status == "not_found"
    assert resolution.agency is None


@pytest.mark.asyncio
async def test_single_clear_fuzzy_match_returns_ambiguity_candidates():
    resolution = await resolve_travel_agency(Repository(), "details of Alpha Travel Tours")

    assert resolution.status == "ambiguous"
    assert [agency.name for agency in resolution.candidates or []] == ["Alpha Tours"]


@pytest.mark.asyncio
async def test_directory_abbreviation_matches_a_visitor_friendly_agency_name():
    class AbbreviatedDirectoryRepository:
        async def get_travel_agency_by_name(self, _name, district=None):
            return None

        async def search_travel_agencies(self, _query, limit=25):
            return [
                TravelAgency(
                    name="M/s Denizen T&T",
                    registration_number="1542/DoT&Cav/E/23/TA",
                    district="Gangtok",
                )
            ]

    resolution = await resolve_travel_agency(
        AbbreviatedDirectoryRepository(),
        "Give me full details on Denizen Tours and Travels.",
    )

    assert resolution.status == "matched"
    assert resolution.agency is not None
    assert resolution.agency.name == "M/s Denizen T&T"
