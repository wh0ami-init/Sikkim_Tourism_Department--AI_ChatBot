"""Read-only public destination endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

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
        category: str | None = Query(None, pattern="^(road_status|cancellation_order|tender)$"),
        limit: int = Query(50, ge=1, le=100),
        repo: BaseRepository = Depends(get_repo),
):
    """Return a compact, read-only feed of the latest official notices.

    This is intentionally a projection rather than the admin circular API: a
    visitor needs the title, date, area, category, and official source—not OCR
    text or internal ingestion details.
    """
    circulars = await repo.list_circulars(category=category, limit=limit)
    return [
        AdvisorySummary(
            id=circular.id or 0,
            title=circular.title,
            category=circular.category,
            district=circular.district,
            issue_date=circular.issue_date,
            source_url=circular.source_url,
            has_file=circular.has_file,
        )
        for circular in circulars
    ]


@router.get("/advisories/{circular_id}/file")
@limiter.limit("30/minute")
async def get_public_advisory_file(
        circular_id: int,
        request: Request,
        repo: BaseRepository = Depends(get_repo),
):
    """Serve the original administrator-uploaded road-status file inline."""
    circular = await repo.get_circular_file(circular_id)
    if not circular or not circular.stored_file:
        raise HTTPException(status_code=404, detail="No uploaded file is available for this advisory.")
    safe_name = (circular.file_name or f"advisory-{circular_id}").replace('"', "")
    return Response(
        content=circular.stored_file,
        media_type=circular.file_mime_type or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


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
