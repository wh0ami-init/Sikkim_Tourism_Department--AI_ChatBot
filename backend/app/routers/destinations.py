"""Read-only public destination endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.database.base import BaseRepository
from app.database.factory import get_repo
from app.models.schemas import AdvisorySummary, Destination, DestinationSummary, DestinationsListResponse
from app.limiting import limiter

router = APIRouter()

VALID_CATEGORIES = {"nature", "culture", "adventure", "pilgrimage", "wildlife"}


def _to_summary(d: Destination) -> DestinationSummary:
    description_text = d.description or ""
    trimmed_desc = description_text[:160] + ("…" if len(description_text) > 160 else "")
    return DestinationSummary(
        id=d.id,
        name=d.name,
        slug=d.slug,
        category=d.category,
        district=d.district,
        best_time=d.best_time,
        permit_required=d.permit_required,
        tags=d.tags,
        image_placeholder=d.image_placeholder,
        image_url=d.image_url,
        description=trimmed_desc,
        latitude=d.latitude,
        longitude=d.longitude,
    )


@router.get("", response_model=DestinationsListResponse)
@limiter.limit("60/minute")
async def list_destinations(
        request: Request,
        search: str | None = Query(None, max_length=100),
        category: str | None = Query(None),
        repo: BaseRepository = Depends(get_repo),
):
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Choose from: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    destinations = await repo.list_destinations(search=search, category=category)
    return DestinationsListResponse(
        destinations=[_to_summary(d) for d in destinations],
        total=len(destinations),
    )


@router.get("/categories")
@limiter.limit("60/minute")
async def list_categories(request: Request):
    return {"categories": sorted(VALID_CATEGORIES)}


@router.get("/advisories", response_model=list[AdvisorySummary])
@limiter.limit("30/minute")
async def list_public_advisories(
        request: Request,
        limit: int = Query(3, ge=1, le=5),
        repo: BaseRepository = Depends(get_repo),
):
    """Return a compact, read-only feed of the latest official notices.

    This is intentionally a projection rather than the admin circular API: a
    visitor needs the title, date, area, category, and official source—not OCR
    text or internal ingestion details.
    """
    circulars = await repo.list_circulars(limit=limit)
    return [
        AdvisorySummary(
            id=circular.id or 0,
            title=circular.title,
            category=circular.category,
            district=circular.district,
            issue_date=circular.issue_date,
            source_url=circular.source_url,
        )
        for circular in circulars
    ]


@router.get("/{destination_id}", response_model=Destination)
@limiter.limit("60/minute")
async def get_destination(
        destination_id: int,
        request: Request,
        repo: BaseRepository = Depends(get_repo),
):
    destination = await repo.get_destination(destination_id)
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found.")
    return destination
