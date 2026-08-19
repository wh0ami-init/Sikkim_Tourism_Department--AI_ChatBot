"""
|| Sikkim Tourism Assistant || — FastAPI Backend Entry Point.

Run locally:
    uvicorn main:app --reload --port 8000

Or directly:
    python main.py
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

import uvicorn
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database.factory import get_repo
from app.dependencies import _DUMMY_PASSWORD_HASH, verify_admin_credentials, verify_admin_key
from app.limiting import limiter
from app.routers import chat, destinations
from app.startup import resync_vectorstore, populate_vectorstore
from app.models.schemas import AdminCredentials, AdminCredentialsChange, AdminUser, Destination, DestinationWrite
from app.services.admin_auth import hash_password, validate_password, verify_password

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class RequestBodyTooLarge(Exception):
    """Raised before an oversized request body reaches FastAPI's parsers."""


class RequestSizeLimitMiddleware:
    """Bound streamed request bodies before JSON or multipart parsing allocates memory."""

    def __init__(self, app) -> None:
        self.app = app

    @staticmethod
    def _limit_for_path(path: str) -> int | None:
        if path == "/api/admin/upload-circular":
            return settings.max_admin_upload_request_bytes
        if path.startswith("/api/conversations/") and path.endswith("/chat"):
            return settings.max_chat_request_bytes
        return None

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for_path(scope["path"])
        if limit is None:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > limit:
                    await JSONResponse(
                        status_code=413,
                        content={"detail": "Request exceeds the server limit."},
                    )(scope, receive, send)
                    return
            except ValueError:
                await JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header."},
                )(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await JSONResponse(
                status_code=413,
                content={"detail": "Request exceeds the server limit."},
            )(scope, receive, send)

@asynccontextmanager
async def lifespan(app: FastAPI):
    repo = get_repo()

    # Populate the retrieval index without preventing the API from starting.
    try:
        indexed = await populate_vectorstore(repo)
        logger.info("Startup: Vectorstore populated with %d documents.", indexed)
    except Exception as exc:
        logger.error("Startup: Failed to populate vectorstore (non-fatal): %s", exc)
        logger.warning(
            "The chat service will start without a populated vectorstore. "
            "This may lead to degraded performance or missing information."
        )

    # Start the optional circular-ingestion scheduler.
    scheduler = None
    initial_circular_sync_task: asyncio.Task[None] | None = None
    if settings.enable_circular_scraper:
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from app.services.circular_scraper import run_circular_sync
        except ModuleNotFoundError as exc:
            logger.error(
                "Startup: Failed to import circular scraper dependencies (non-fatal): %s",
                exc.name,
            )
            logger.warning(
                "The circular scraper will not run. Please ensure all dependencies are installed."
            )
        else:
            async def initial_circular_sync() -> None:
                """Run the first sync without holding the API in startup state."""
                try:
                    summary = await run_circular_sync(repo)
                    logger.info(
                        "Startup: Initial circular sync completed. %d new circulars processed.",
                        summary["new"],
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error("Startup: Initial circular sync failed (non-fatal): %s", exc)

            initial_circular_sync_task = asyncio.create_task(
                initial_circular_sync(), name="initial-circular-sync"
            )
            logger.info("Startup: Initial circular sync is running in the background.")

            scheduler = AsyncIOScheduler()

            scheduler.add_job(
                run_circular_sync,
                "interval",
                minutes=settings.circulars_sync_interval_minutes,
                args=[repo],
                id="circular_sync",
                max_instances=1,
                coalesce=True,
            )

            scheduler.start()
            logger.info(
                "Startup: Circular scraper scheduled to run every %d minutes.",
                settings.circulars_sync_interval_minutes,
            )
    else:
        logger.info(
            "Startup: Circular scraper is disabled. No scheduled tasks will run. "
            "Manual Upload of circulars is still possible via the /circulars/upload endpoint."
        )
    yield

    if scheduler is not None:
        scheduler.shutdown(wait=False)
    if initial_circular_sync_task is not None and not initial_circular_sync_task.done():
        initial_circular_sync_task.cancel()
        with suppress(asyncio.CancelledError):
            await initial_circular_sync_task

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply consistent browser security headers to API responses."""

    async def dispatch(self, request: Request, call_next):

        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = _content_security_policy(request.url.path)
        response.headers["Permissions-Policy"] = ("geolocation=(), microphone=(self), camera=()")

        # Responses containing authenticated or conversation data must not be cached.
        if request.url.path.startswith(("/api/conversations", "/api/admin")):
            response.headers.setdefault(
                "Cache-Control", "no-store, max-age=0, must-revalidate"
            )
        elif (
                request.method == "GET"
                and request.url.path.startswith("/api/destinations")
                and response.status_code == 200
        ):

            response.headers.setdefault(
                "Cache-Control", "public, max-age=300, s-maxage=3600"
            )

        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response
def _content_security_policy(path: str) -> str:
    """Return the least-permissive policy needed for the requested endpoint.

    FastAPI's Swagger and ReDoc pages use CDN assets and an inline bootstrap
    script. The main API never needs those permissions, so the exception is
    constrained to the two documentation routes rather than weakening every
    response served by the application.
    """
    if path in {"/api/docs", "/api/redoc"}:
        return (
            "default-src 'self'; "
            "base-uri 'self'; "
            "frame-ancestors 'none'; "
            "form-action 'self'; "
            "img-src 'self' data: https://fastapi.tiangolo.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "connect-src 'self'"
        )

    return (
        "default-src 'self'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "connect-src 'self' https://api.open-meteo.com"
    )
app = FastAPI(
    title = "Sikkim Tourism AI Assistant API Endpoints Console Page",
    description = (
        "This API provides endpoints for interacting with the Sikkim Tourism AI Assistant,"
        "AI-powered Tourism Assistant for the Tourism and Civil Aviation Department, Government of Sikkim."
        "Powered by LangChain + Qdrant RAG + Google Gemini."
    ),
    version = "2.0.0",
    # Keep interactive API documentation out of production.
    docs_url = "/api/docs" if settings.environment != "production" else None,
    redoc_url = "/api/redoc" if settings.environment != "production" else None,
    openapi_url = "/api/openapi.json" if settings.environment != "production" else None,
    lifespan = lifespan,
)
origins = settings.origins_list
methods = settings.methods_list
headers = settings.headers_list
allow_credentials = origins != ["*"]

app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins = origins,
    allow_methods = methods,
    allow_credentials = allow_credentials,
    allow_headers = headers,
)

app.state.limiter = limiter
app.include_router(destinations.router, prefix = "/api/destinations", tags = ["Destinations"])
app.include_router(chat.router, prefix = "/api/conversations", tags = ["Chat"])

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code = 429,
        content = {"detail": "Too many requests. Please wait a moment before trying again."},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log detail server-side while returning a stable public error shape."""
    if settings.environment == "production":
        logger.error(
            f"Unhandled {type(exc).__name__} on {request.method} {request.url.path}"
        )
    else:
        logger.exception(
            f"Unhandled error on {request.method} {request.url.path}"
        )

    return JSONResponse(
        status_code = 500,
        content = {"detail": "Internal server error. Please try again."},
    )
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/api/health", tags=["System"])
@limiter.limit("60/minute")
def health(request: Request):
    if settings.environment == "production":
        return {"status": "ok", "version": "2.0.0"}
    return {
        "status": "ok",
        "version": "2.0.0",
        "db_mode": settings.db_mode,
        "qdrant_mode": settings.qdrant_mode,
        "qdrant_collection": settings.qdrant_collection,
        "embeddings_configured": bool(settings.gemini_api_key),
        "chat_llm_configured": bool(settings.groq_api_key),
    }


@app.get("/admin/upload-circular", include_in_schema=False)
def admin_upload_page():
    """Keep legacy bookmarks working while consolidating Admin_Access."""
    return RedirectResponse(url="/admin", status_code=307)


admin_auth_router = APIRouter(prefix="/api/admin/auth", tags=["Admin authentication"])


@admin_auth_router.get("/status")
@limiter.limit("20/minute")
async def admin_auth_status(request: Request, repo=Depends(get_repo)):
    """Only indicates whether first-admin setup is needed; no account data leaks."""
    return {"setup_required": not await repo.admin_user_exists()}


@admin_auth_router.post("/setup")
@limiter.limit("5/minute")
async def setup_first_admin(
        request: Request,
        credentials: AdminCredentials,
        repo=Depends(get_repo),
        _=Depends(verify_admin_key),
):
    """Create the first password account, guarded by the server-only bootstrap key."""
    if await repo.admin_user_exists():
        raise HTTPException(
            status_code = 409,
            detail = "An admin account has already been configured.",
        )
    password_error = validate_password(credentials.password)
    if password_error:
        raise HTTPException(status_code=422, detail=password_error)
    try:
        password_hash = hash_password(credentials.password)
        await repo.create_admin_user(
            AdminUser(
                username = credentials.username.lower(),
                password_hash = password_hash,
            )
        )
    except Exception as exc:
        logger.warning("First-admin setup failed: %s", exc)
        raise HTTPException(
            status_code=409,
            detail="Admin setup is no longer available.",
        ) from exc
    return {"status": "ok"}


@admin_auth_router.post("/login")
@limiter.limit("10/minute")
async def admin_login(
        request: Request,
        credentials: AdminCredentials,
        repo=Depends(get_repo),
):
    """Authenticate without revealing whether a username exists."""
    user = await repo.get_admin_user(credentials.username.lower())
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    if not verify_password(credentials.password, password_hash) or user is None:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    return {"status": "ok"}


admin_router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
    dependencies=[Depends(verify_admin_credentials)],
)

# This wrapper runs before dependency resolution, avoiding unbounded scrypt
# verification attempts. One shared scope covers every authenticated admin URL.
_ADMIN_RATE_LIMIT = limiter.shared_limit("20/minute", scope="authenticated-admin")


@admin_router.post("/auth/change-credentials")
@_ADMIN_RATE_LIMIT
async def change_admin_credentials(
        request: Request,
        credentials_change: AdminCredentialsChange,
        username: str = Depends(verify_admin_credentials),
        repo=Depends(get_repo),
):
    user = await repo.get_admin_user(username)
    if user is None or not verify_password(
            credentials_change.current_password, user.password_hash
    ):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    password_error = validate_password(credentials_change.new_password)
    if password_error:
        raise HTTPException(status_code=422, detail=password_error)
    password_hash = hash_password(credentials_change.new_password)
    try:
        updated = await repo.update_admin_credentials(
            username,
            credentials_change.new_username,
            password_hash,
        )
    except Exception as exc:
        logger.warning("Admin credential change failed: %s", exc)
        raise HTTPException(
            status_code=409,
            detail="That username is already in use.",
        ) from exc
    if not updated:
        raise HTTPException(status_code=409, detail="That username is already in use.")
    return {"status": "ok"}


@admin_router.post("/sync")
@_ADMIN_RATE_LIMIT
async def sync_vectorstore(request: Request, repo=Depends(get_repo)):
    """
    Manually re-sync the Qdrant vector store with the active repository.
    Useful after updating destinations in MySQL without restarting the server.
    """
    return await resync_vectorstore(repo)


@admin_router.post("/sync-circulars")
@_ADMIN_RATE_LIMIT
async def sync_circulars(request: Request, repo=Depends(get_repo)):
    """
    Manually trigger a circulars scrape immediately instead of waiting for
    the next scheduled tick. Same underlying function the scheduler calls —
    same behaviour, same safety limits, just an on-demand trigger.
    """
    if not settings.enable_circular_scraper:
        return {
            "status": "disabled",
            "detail": "Automatic circular scraping is disabled on this deployment.",
        }
    from app.services.circular_scraper import run_circular_sync

    return await run_circular_sync(repo)


@admin_router.post("/sync-agencies")
@_ADMIN_RATE_LIMIT
async def sync_agencies(request: Request, repo=Depends(get_repo)):
    """
    Manually trigger a travel-agency directory sync — pulls the six
    department district JSON files and upserts every valid record.
    Unlike circulars this isn't scheduled automatically (the directory
    changes rarely); this on-demand trigger is the only way it runs today.
    """
    from app.services.travel_agency_scraper import run_travel_agency_sync

    return await run_travel_agency_sync(repo)


_UPLOAD_CATEGORIES = {"road_status", "cancellation_order", "tender"}


@admin_router.get("/dashboard")
@_ADMIN_RATE_LIMIT
async def admin_dashboard(request: Request, repo=Depends(get_repo)):
    """Return the small operational summary rendered by the admin console."""
    destinations, circulars, agency_count = await asyncio.gather(
        repo.list_destinations(),
        repo.list_circulars(limit=5),
        repo.count_travel_agencies(),
    )
    return {
        "destination_count": len(destinations),
        "recent_circulars": circulars,
        "travel_agency_count": agency_count,
        "db_mode": settings.db_mode,
        "qdrant_mode": settings.qdrant_mode,
    }


@admin_router.get("/destinations", response_model=list[Destination])
@_ADMIN_RATE_LIMIT
async def admin_list_destinations(request: Request, repo=Depends(get_repo)):
    return await repo.list_destinations()


@admin_router.post("/destinations", response_model=Destination, status_code=201)
@_ADMIN_RATE_LIMIT
async def admin_create_destination(
        request: Request,
        destination: DestinationWrite,
        repo=Depends(get_repo),
):
    try:
        return await repo.create_destination(destination)
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A destination with this slug already exists.",
            )
        raise


@admin_router.put("/destinations/{destination_id}", response_model=Destination)
@_ADMIN_RATE_LIMIT
async def admin_update_destination(
        destination_id: int,
        request: Request,
        destination: DestinationWrite,
        repo=Depends(get_repo),
):
    try:
        updated = await repo.update_destination(destination_id, destination)
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="A destination with this slug already exists.",
            )
        raise
    if not updated:
        raise HTTPException(status_code=404, detail="Destination not found.")
    return updated


@admin_router.delete("/destinations/{destination_id}", status_code=204)
@_ADMIN_RATE_LIMIT
async def admin_delete_destination(
        destination_id: int,
        request: Request,
        repo=Depends(get_repo),
):
    if not await repo.delete_destination(destination_id):
        raise HTTPException(status_code=404, detail="Destination not found.")


@admin_router.get("/circulars")
@_ADMIN_RATE_LIMIT
async def admin_list_circulars(
        request: Request,
        limit: int = Query(100, ge=1, le=250),
        repo=Depends(get_repo),
):
    return await repo.list_circulars(limit=limit)


@admin_router.delete("/circulars/{circular_id}", status_code=204)
@_ADMIN_RATE_LIMIT
async def admin_delete_circular(
        circular_id: int,
        request: Request,
        repo=Depends(get_repo),
):
    if not await repo.delete_circular(circular_id):
        raise HTTPException(status_code=404, detail="Circular not found.")


@admin_router.get("/travel-agencies")
@_ADMIN_RATE_LIMIT
async def admin_list_travel_agencies(
        request: Request,
        district: str | None = Query(None),
        limit: int = Query(100, ge=1, le=2000),
        repo=Depends(get_repo),
):
    return await repo.list_travel_agencies(district=district, limit=limit)


@admin_router.post("/upload-circular")
@_ADMIN_RATE_LIMIT
async def upload_circular(
        request: Request,
        file: UploadFile = File(...),
        title: str = Form(...),
        category: str = Form("road_status"),
        district: str | None = Form(None),
        repo=Depends(get_repo),
):
    """
    Manual ingestion path for circulars that never appear on the public
    website — chiefly the road status report, which the Police Control
    Room sends over WhatsApp and never publishes anywhere online. There is
    no way to scrape something that was never published, so a person saves
    the WhatsApp PDF/photo and uploads it here; everything downstream
    (hash dedup, text extraction, storage) is identical to the automatic
    scraper.

    Accepts either a real PDF or a plain photo (jpg/png/webp) straight off
    WhatsApp, since the road report is usually a photographed scan.
    """
    if category not in _UPLOAD_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of: {', '.join(sorted(_UPLOAD_CATEGORIES))}",
        )
    title = title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required.")
    if len(title) > 300:
        raise HTTPException(
            status_code=422,
            detail="title must be 300 characters or fewer.",
        )
    if district is not None:
        district = district.strip() or None
        if district and len(district) > 100:
            raise HTTPException(
                status_code=422,
                detail="district must be 100 characters or fewer.",
            )

    # UploadFile spools large multipart bodies to disk, but reading it without
    # a bound would copy an attacker-controlled file into process memory before
    # this size check runs.  Read at most one byte beyond the allowed limit.
    max_upload_bytes = settings.circulars_max_pdf_bytes
    file_bytes = await file.read(max_upload_bytes + 1)
    if len(file_bytes) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {max_upload_bytes // (1024 * 1024)} MB limit.",
        )
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # This import is deliberately local: PDF/image processing is an admin-only
    # feature and importing its native/browser stack at app startup can push a
    # 512 MiB web service over its memory limit.
    from app.services.circular_scraper import ingest_uploaded_circular

    result = await ingest_uploaded_circular(
        repo,
        file_bytes=file_bytes,
        title=title,
        category=category,
        source_url="manual-upload:whatsapp",
        mime_type=file.content_type,
        file_name=file.filename,
        district=district,
    )

    if result["status"] == "rejected":
        raise HTTPException(status_code=400, detail=result["detail"])
    if result["status"] == "failed":
        raise HTTPException(status_code=422, detail=result["detail"])

    return result


app.include_router(admin_router)
app.include_router(admin_auth_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
