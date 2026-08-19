"""
|| Circular_Scraper || — pulls road status / cancellation-order / notice PDFs
from the department's own notices page into the local `circulars` table.

This is the ONLY piece of the app that talks to the department's live
website. It runs on a schedule (see main.py's lifespan) and can also be
triggered on demand via POST /api/admin/sync-circulars. The chat endpoint
never calls this module directly or reaches out to the website itself — it
only ever reads whatever this scraper has already saved via the repository.

Security notes (read before changing the allowlist logic below):
  - SSRF guard: every URL fetched (the listing page AND every PDF link
    found on it) is validated against `settings.circulars_allowed_host`
    before any request is made. For the PDF downloads (plain httpx),
    redirects are disabled entirely. The listing page is rendered by a
    real browser (see `_fetch_listing_page`), which follows redirects
    transparently by design — so instead we check `driver.current_url`
    against the allowlist *after* navigation and abort if the browser
    ended up off-host, before any of that page's HTML is trusted.
  - Size guard: PDFs are streamed with a hard byte ceiling
    (`circulars_max_pdf_bytes`) instead of being read fully into memory
    on trust — a compromised or misconfigured page shouldn't be able to
    hand us a multi-GB response and exhaust the server.
  - Content sniffing: a downloaded file must start with the `%PDF-` magic
    bytes before we hand it to any parser, regardless of what the server's
    Content-Type header claimed.
  - Batch guard: at most `circulars_max_per_run` new files are processed
    in a single run, so a page returning far more links than expected
    can't turn one sync into an unbounded job.
  - Per-file isolation: one bad/corrupt PDF is logged and skipped — it
    never aborts the rest of the batch.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import date, datetime, timezone
from urllib.parse import urljoin, urlparse

import fitz  # PyMuPDF
import httpx

from app.config import settings
from app.database.base import BaseRepository
from app.models.schemas import Circular

logger = logging.getLogger(__name__)

_PDF_MAGIC = b"%PDF-"
_REQUEST_TIMEOUT = httpx.Timeout(15.0, connect=10.0)

# Category classification is a simple title-keyword heuristic — good enough
# to start, and safe to get "wrong" since it only affects which context
# bucket a circular is grouped into, never whether it gets ingested.
_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    ("road situation", "road_status"),
    ("road status", "road_status"),
    ("cancellation", "cancellation_order"),
]

# Vision fallback is capped to the first few pages — road/cancellation
# notices are short, and this bounds both latency and Gemini cost per file.
_MAX_VISION_PAGES = 5
_MAX_PDF_PAGES = 50
_MAX_STORED_TEXT_CHARS = 12_000
_VISION_TRANSCRIPTION_PROMPT = (
    "Read this scanned government circular carefully. Transcribe every readable word, "
    "number, date, heading, and road name exactly as written. Preserve line breaks where "
    "useful. Do not summarize or describe the image. Return only the transcription. "
    "If there truly is no readable text, return exactly NO_TEXT."
)


def _classify_category(title: str) -> str:
    lowered = title.lower()
    for keyword, category in _CATEGORY_KEYWORDS:
        if keyword in lowered:
            return category
    return "notice"


def _is_allowed_url(url: str) -> bool:
    """SSRF guard — only HTTPS on the configured host's default port is valid."""
    parsed = urlparse(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname == settings.circulars_allowed_host
        and parsed.port in (None, 443)
        and not parsed.username
        and not parsed.password
    )


_CANDIDATE_LINK_TEXTS = [
    "notice", "notices", "notice board", "notification", "notifications",
    "circular", "circulars", "tender", "tenders", "notice & circular",
    "notification & circular",
]


def _find_listing_link(driver, target_url: str):
    """
    Best-effort discovery of the in-page link to the notices route.
    Tries an href match first (works regardless of link wording), then
    falls back to visible-text matching against common nav labels.
    Returns the Selenium WebElement, or None if nothing matched.
    """
    from selenium.webdriver.common.by import By

    anchors = driver.find_elements(By.TAG_NAME, "a")
    target_path = urlparse(target_url).path.rstrip("/").lower()

    for a in anchors:
        href = a.get_attribute("href") or ""
        if href and urlparse(href).path.rstrip("/").lower() == target_path:
            return a

    for a in anchors:
        text = (a.text or "").strip().lower()
        if text and any(candidate in text for candidate in _CANDIDATE_LINK_TEXTS):
            return a

    return None


def _dump_debug(driver, label: str) -> str:
    """
    Saves the current page source to disk and returns a short summary
    (current URL + up to 40 anchor texts/hrefs) to fold into an exception
    message — so a single failure carries everything needed to diagnose
    it, instead of a multi-round back-and-forth to find out what the
    page actually looked like.
    """
    import os

    from selenium.webdriver.common.by import By

    debug_dir = "/tmp/circular_scraper_debug"
    os.makedirs(debug_dir, exist_ok=True)
    path = os.path.join(debug_dir, f"{label}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(driver.page_source)

    anchors = driver.find_elements(By.TAG_NAME, "a")[:40]
    listing = "; ".join(
        f"{(a.text or '').strip()[:30]!r}->{a.get_attribute('href')}" for a in anchors
    )
    return f"[debug HTML saved to {path}] current_url={driver.current_url!r} anchors=[{listing}]"


def _fetch_listing_page_sync(target_url: str) -> str:
    """
    Blocking Selenium/Firefox render of the notices page — see
    `_fetch_listing_page` for why this exists and why Firefox specifically.
    Runs inside `asyncio.to_thread` since Selenium's WebDriver API has no
    async form.

    The notices route is handled by a client-side SPA router, not a real
    server-side URL — a fresh top-level page load (driver.get) resets the
    JS app's in-memory state on every navigation, so hitting the notices
    URL directly (even right after a warm-up visit to `/`) can reliably
    land back on the homepage: a second driver.get() is itself a full
    reload that throws away whatever state the warm-up visit built up.
    The reliable path is to load `/` once and let the page's own router
    perform the transition — i.e. click the nav link, the same way a
    real visitor gets there.

    Two-tier attempt:
      1. Fast path — direct navigation. Cheap, and correct if the site's
         routing ever changes to a real server URL. A slow/timed-out
         load here isn't fatal — we just fall through to attempt 2.
      2. Fallback — reload the homepage fresh and click the in-page
         notices link, letting client-side routing do the transition.

    If both fail, the raised error includes a saved copy of the page
    HTML plus every anchor found on it, so the failure is self-diagnosing.
    """
    # These packages are optional in the normal API deployment.  Import them
    # only when the scheduled scraper is actually invoked, so manual uploads
    # continue to work without Selenium/Firefox installed.
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.firefox.options import Options as FirefoxOptions
    from selenium.webdriver.support.ui import WebDriverWait

    options = FirefoxOptions()
    options.add_argument("-headless")
    # Deliberately NOT overriding the User-Agent. A prior version sent
    # "SikkimTourismAssistant-CircularSync/1.0" — a string no real browser
    # emits. Government sites are commonly behind a WAF that silently
    # redirects unrecognized/non-browser User-Agents back to "/", which
    # would produce exactly the "bounced to homepage" symptom we saw.
    # Firefox's real UA costs nothing here and removes that variable.

    driver = webdriver.Firefox(options=options)
    try:
        # Generous timeout: a full top-level load of the notices route
        # pulls in noticeably more than the homepage does, and this is a
        # public government server with no latency guarantees.
        driver.set_page_load_timeout(45)

        def _wait_ready() -> None:
            WebDriverWait(driver, 20).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )

        def _on_target() -> bool:
            return (
                    _is_allowed_url(driver.current_url)
                    and driver.current_url.rstrip("/") == target_url.rstrip("/")
            )

        # --- Attempt 1: direct navigation ---
        # A slow/timed-out load here isn't fatal — it just means we fall
        # through to attempt 2 below instead of aborting the whole run.
        try:
            driver.get(target_url)
            if not _is_allowed_url(driver.current_url):
                raise RuntimeError(
                    f"Listing page redirected off-host to {driver.current_url!r} — aborting."
                )
            _wait_ready()

            if _on_target():
                return driver.page_source
        except TimeoutException:
            logger.info(
                "Direct navigation to the notices page timed out — "
                "falling back to homepage + click-through."
            )

        # --- Attempt 2: click-through fallback ---
        homepage = f"https://{settings.circulars_allowed_host}/"
        driver.get(homepage)
        if not _is_allowed_url(driver.current_url):
            raise RuntimeError(
                f"Homepage redirected off-host to {driver.current_url!r} — aborting."
            )
        _wait_ready()

        link = _find_listing_link(driver, target_url)
        if link is None:
            debug = _dump_debug(driver, "homepage_no_link_found")
            raise RuntimeError(
                f"Could not find a link to the notices page on the homepage. {debug}"
            )

        driver.execute_script("arguments[0].click();", link)
        _wait_ready()

        if not _on_target():
            debug = _dump_debug(driver, "click_wrong_destination")
            raise RuntimeError(
                f"Clicked the notices link but ended up somewhere unexpected. {debug}"
            )

        return driver.page_source
    finally:
        driver.quit()


async def _fetch_listing_page(target_url: str) -> str:
    """
    The notices page is a JS-rendered SPA — the raw HTML httpx would get
    back is an empty shell with no actual notice links in it. We render
    it with a real (headless) browser instead, then hand the fully
    built HTML to the existing BeautifulSoup parser below unchanged.

    Firefox (via Selenium + geckodriver) instead of Playwright/Chromium:
    Firefox is the only major browser engine still receiving updates
    across every OS this project needs to run on, dev machines on older
    macOS releases included — Chrome dropped macOS 11 support in 2025 and
    Safari dropped it back in 2023. Selenium 4.6+ resolves and downloads
    a matching geckodriver automatically (Selenium Manager); the only
    prerequisite is having Firefox itself installed.

    """
    return await asyncio.to_thread(_fetch_listing_page_sync, target_url)


def _extract_pdf_links(html: str, base_url: str) -> list[tuple[str, str]]:
    """Return unique ``(PDF URL, official listing title)`` pairs.

    The department's current listing labels document actions only as "View"
    and "Download". The useful title is the heading in the surrounding card.
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")
    links: list[tuple[str, str]] = []
    seen_urls: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        if ".pdf" not in href.lower():
            continue
        absolute = urljoin(base_url, href)
        if not _is_allowed_url(absolute):
            logger.warning("Skipping off-host PDF link: %s", absolute)
            continue
        if absolute in seen_urls:
            continue
        seen_urls.add(absolute)
        card = anchor.find_parent(["article", "li", "tr"])
        heading = card.find(["h1", "h2", "h3", "h4", "h5"]) if card else None
        title = (
            (heading.get_text(" ", strip=True) if heading else "")
            or anchor.get("title", "").strip()
            or anchor.get("aria-label", "").strip()
            or href.rsplit("/", 1)[-1]
        )
        links.append((absolute, title))
    return links


async def _download_pdf(client: httpx.AsyncClient, url: str) -> bytes | None:
    """Stream-download with a hard size cap. Returns None if oversized/invalid."""
    max_bytes = settings.circulars_max_pdf_bytes
    chunks: list[bytes] = []
    total = 0
    async with client.stream("GET", url) as resp:
        resp.raise_for_status()
        async for chunk in resp.aiter_bytes():
            total += len(chunk)
            if total > max_bytes:
                logger.warning("PDF exceeded size cap, aborting download: %s", url)
                return None
            chunks.append(chunk)
    data = b"".join(chunks)
    if not data.startswith(_PDF_MAGIC):
        logger.warning("Downloaded file is not a real PDF (bad magic bytes): %s", url)
        return None
    return data


def _extract_text_pymupdf(pdf_bytes: bytes) -> str:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        # Bound parser work for adversarial PDFs with thousands of pages.
        return "\n".join(page.get_text().strip() for page in doc[:_MAX_PDF_PAGES]).strip()


def _render_vision_pages_sync(pdf_bytes: bytes) -> list[str]:
    """Blocking PyMuPDF render step for `_extract_text_vision` — page
    rasterization is CPU-bound and must not run on the event loop thread.
    Returns base64-encoded PNGs, one per page (up to `_MAX_VISION_PAGES`).
    """
    import base64

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return [
            base64.b64encode(page.get_pixmap(dpi=200).tobytes("png")).decode()
            for page in doc[:_MAX_VISION_PAGES]
        ]


async def _extract_text_vision(pdf_bytes: bytes) -> str:
    """Fallback for scanned/photographed PDFs with no real text layer.

    Renders the first few pages as images and asks Gemini Vision to
    transcribe them — reuses the exact same client setup as the chat
    app's existing image-chat path (see rag_chain.py).
    """
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not set — cannot OCR scanned circular via vision.")
        return ""

    page_images = await asyncio.to_thread(_render_vision_pages_sync, pdf_bytes)
    vision_llm = _get_vision_transcriber()
    page_texts: list[str] = []
    for image_b64 in page_images:
        page_texts.append(
            await _transcribe_image(vision_llm, f"data:image/png;base64,{image_b64}")
        )
    return "\n".join(page_texts).strip()


async def _extract_text(pdf_bytes: bytes) -> str:
    text = await asyncio.to_thread(_extract_text_pymupdf, pdf_bytes)
    if len(text) >= 40:  # a real text layer — cheap and fast, use it
        return text
    logger.info("PDF has little/no text layer — falling back to Gemini Vision.")
    return await _extract_text_vision(pdf_bytes)


async def _extract_text_vision_raw_image(image_bytes: bytes, mime_type: str) -> str:
    """
    Same Gemini Vision transcription as `_extract_text_vision`, but for a
    plain photo (JPG/PNG straight off WhatsApp) instead of a PDF page —
    there is no PyMuPDF render step since there's no PDF to open.
    """
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not set — cannot OCR image via vision.")
        return ""

    import base64

    # Browsers and mobile clients occasionally send application/octet-stream or
    # a slightly different MIME value even when the bytes are a valid image.
    # Use the detected format; the browser-provided value is not trusted.
    detected_mime = _detect_image_mime(image_bytes, mime_type)
    if detected_mime is None:
        logger.warning("Uploaded circular image has no recognised file signature.")
        return ""
    image_b64 = base64.b64encode(image_bytes).decode()
    try:
        text = await _transcribe_image(
            _get_vision_transcriber(), f"data:{detected_mime};base64,{image_b64}"
        )
        return _clean_ocr_text(text)
    except Exception:
        logger.exception("Gemini Vision OCR failed for uploaded image")
        return ""


def _detect_image_mime(image_bytes: bytes, declared_mime: str) -> str | None:
    """Return an image MIME type only when the bytes carry a recognised signature.

    ``UploadFile.content_type`` is supplied by the client and is therefore not
    evidence of a file's format.  Never promote an unrecognised byte stream to
    an image based on that header alone.
    """
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


def _clean_ocr_text(text: str) -> str:
    """Treat Gemini's common no-text placeholders as an empty OCR result."""
    import re

    cleaned = "\n".join(line.rstrip() for line in (text or "").splitlines()).strip()
    marker = re.sub(r"[^a-z0-9]+", "", cleaned.lower())
    if not cleaned or marker in {"notext", "blank", "noreadabletext", "unreadable"}:
        return ""
    return cleaned


def _get_vision_transcriber():
    """Create the shared low-temperature Gemini OCR client."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=0.0,
        max_output_tokens=8192,
    )


async def _transcribe_image(vision_llm, image_url: str) -> str:
    """Transcribe one image with a configured Gemini OCR client."""
    from langchain_core.messages import HumanMessage

    message = HumanMessage(content=[
        {"type": "text", "text": _VISION_TRANSCRIPTION_PROMPT},
        {"type": "image_url", "image_url": {"url": image_url}},
    ])
    result = await vision_llm.ainvoke([message])
    content = result.content
    # Newer LangChain versions may return a list of content blocks rather than
    # a plain string. Joining their text avoids persisting Python list syntax or
    # an empty block as the circular's extracted text.
    if isinstance(content, list):
        parts = [
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        ]
        return "\n".join(part for part in parts if part).strip()
    return str(content or "").strip()


_ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def _save_circular(
    repo: BaseRepository,
    *,
    title: str,
    category: str,
    district: str | None,
    source_url: str,
    pdf_hash: str,
    extracted_text: str,
    stored_file: bytes | None = None,
    file_mime_type: str | None = None,
    file_name: str | None = None,
) -> Circular:
    """Create and persist a circular after validation, deduplication, and OCR."""
    return await repo.save_circular(
        Circular(
            title=title[:300],
            category=category,
            district=district,
            issue_date=_guess_issue_date(title),
            source_url=source_url,
            pdf_hash=pdf_hash,
            # Keep OCR/PDF text bounded before it reaches MySQL and the LLM
            # prompt. A malformed PDF can otherwise expand into a very large
            # database row and an expensive context payload.
            extracted_text=extracted_text[:_MAX_STORED_TEXT_CHARS],
            ingested_at=datetime.now(timezone.utc),
            stored_file=stored_file,
            file_mime_type=file_mime_type,
            file_name=file_name,
        )
    )


async def ingest_uploaded_circular(
        repo: BaseRepository,
        *,
        file_bytes: bytes,
        title: str,
        category: str,
        source_url: str,
        mime_type: str | None = None,
        file_name: str | None = None,
        district: str | None = None,
) -> dict:
    """
    Shared ingestion core for a circular that did NOT come from the scraper —
    currently used by POST /api/admin/upload-circular for road-status reports
    forwarded over WhatsApp (which never appear anywhere on the public site).

    Deliberately reuses the exact same hash-dedup, text-extraction, and
    persistence logic as `run_circular_sync` below, so a circular behaves
    identically to the model/chat layer regardless of how it was ingested.

    Accepts EITHER a real PDF or a plain photo (JPG/PNG/WEBP) — WhatsApp
    forwards of the road report are usually a photographed scan, not a
    clean PDF, so there's no PyMuPDF render step for those; they go
    straight to Gemini Vision.
    """
    is_pdf = file_bytes.startswith(_PDF_MAGIC)
    detected_mime = _detect_image_mime(file_bytes, mime_type or "")
    is_image = not is_pdf and detected_mime in _ALLOWED_IMAGE_MIME_TYPES

    if not is_pdf and not is_image:
        return {
            "status": "rejected",
            "detail": (
                "File is not a recognised PDF or image (jpg/png/webp). "
                "If this was meant to be a PDF, the upload may be corrupt."
            ),
        }

    pdf_hash = hashlib.sha256(file_bytes).hexdigest()
    if await repo.circular_exists(pdf_hash):
        return {
            "status": "duplicate",
            "detail": "This exact file has already been ingested — skipped.",
        }

    if is_pdf:
        extracted_text = await _extract_text(file_bytes)
    else:
        # ``is_image`` above guarantees a magic-byte-derived MIME type.
        extracted_text = await _extract_text_vision_raw_image(file_bytes, detected_mime)

    if not extracted_text:
        return {
            "status": "failed",
            "detail": "No text could be extracted from the file (Gemini Vision may be unconfigured).",
        }

    saved = await _save_circular(
        repo,
        title=title[:300],
        category=category,
        district=district,
        source_url=source_url,
        pdf_hash=pdf_hash,
        extracted_text=extracted_text,
        stored_file=file_bytes,
        file_mime_type=("application/pdf" if is_pdf else detected_mime),
        file_name=file_name[:255] if file_name else None,
    )
    logger.info("Ingested manually-uploaded circular: %s", title[:80])

    return {
        "status": "ingested",
        "circular_id": saved.id,
        "extracted_text_preview": extracted_text[:300],
    }


def _guess_issue_date(title: str) -> str:
    """Best-effort DD/MM/YYYY extraction from the title; falls back to today."""
    import re

    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", title)
    if match:
        day, month, year = (int(part) for part in match.groups())
        try:
            return date(year, month, day).isoformat()
        except ValueError:
            pass
    return date.today().isoformat()


async def run_circular_sync(repo: BaseRepository) -> dict:
    """
    Entry point called by both the scheduler and the admin sync endpoint.
    Same function, same behaviour, regardless of caller.
    """
    summary = {"found": 0, "new": 0, "skipped": 0, "failed": 0}

    sources = (
        (settings.circulars_notice_url, "cancellation_order"),
        (settings.circulars_tender_url, "tender"),
    )
    if not all(_is_allowed_url(url) for url, _category in sources):
        logger.error("A circular source URL does not match circulars_allowed_host — refusing to run.")
        return summary

    async with httpx.AsyncClient(
            timeout=_REQUEST_TIMEOUT,
            follow_redirects=False,  # redirects could otherwise hop off-host post-validation
            headers={"User-Agent": "SikkimTourismAssistant-CircularSync/1.0"},
    ) as client:
        for listing_url, category in sources:
            try:
                html = await _fetch_listing_page(listing_url)
            except Exception as exc:
                logger.exception("Failed to fetch circulars listing page %s: %s", listing_url, exc)
                summary["failed"] += 1
                continue
            links = _extract_pdf_links(html, listing_url)
            summary["found"] += len(links)
            for url, title in links[: settings.circulars_max_per_run]:
                try:
                    pdf_bytes = await _download_pdf(client, url)
                    if pdf_bytes is None:
                        summary["skipped"] += 1
                        continue
                    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
                    if await repo.circular_exists(pdf_hash):
                        await repo.refresh_circular_listing_metadata(
                            pdf_hash, title, category, url,
                        )
                        summary["skipped"] += 1
                        continue
                    extracted_text = await _extract_text(pdf_bytes)
                    if not extracted_text:
                        logger.warning("No text extracted from %s — skipping.", url)
                        summary["failed"] += 1
                        continue
                    await _save_circular(repo, title=title, category=category, district=None, source_url=url, pdf_hash=pdf_hash, extracted_text=extracted_text)
                    summary["new"] += 1
                    logger.info("Ingested new %s: %s", category, title[:80])
                except Exception as exc:
                    logger.exception("Failed to process circular %s: %s", url, exc)
                    summary["failed"] += 1

    logger.info("Circular sync complete: %s", summary)
    return summary
