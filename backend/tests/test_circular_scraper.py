"""Offline regression tests for circular OCR helpers."""

import pytest

from app.models.schemas import Circular
from app.services import circular_scraper


def test_circular_text_is_normalised_to_plain_text():
    circular = Circular(
        title="Road advisory",
        category="road_status",
        issue_date="2026-08-21",
        source_url="https://sikkimtourism.gov.in/updates/notice",
        pdf_hash="test-hash",
        extracted_text="Road update&lt;br&gt;Travel carefully.<div>Check official notices.</div>",
    )

    assert circular.extracted_text == "Road update\nTravel carefully.\nCheck official notices."


@pytest.mark.asyncio
async def test_scanned_pdf_joins_each_transcribed_page(monkeypatch):
    """Scanned PDFs must await every page OCR call before joining the text."""
    monkeypatch.setattr(circular_scraper.settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(
        circular_scraper,
        "_render_vision_pages_sync",
        lambda _pdf: ["first-page", "second-page"],
    )
    transcriber = object()
    monkeypatch.setattr(
        circular_scraper, "_get_vision_transcriber", lambda: transcriber
    )

    calls: list[tuple[object, str]] = []

    async def transcribe(client, image_url: str) -> str:
        calls.append((client, image_url))
        return "one" if image_url.endswith("first-page") else "two"

    monkeypatch.setattr(circular_scraper, "_transcribe_image", transcribe)

    assert await circular_scraper._extract_text_vision(b"pdf") == "one\ntwo"
    assert calls == [
        (transcriber, "data:image/png;base64,first-page"),
        (transcriber, "data:image/png;base64,second-page"),
    ]


@pytest.mark.asyncio
async def test_upload_rejects_bytes_that_only_claim_to_be_an_image():
    """The multipart Content-Type header must not substitute for file sniffing."""
    class Repo:
        async def circular_exists(self, _pdf_hash):
            return False

    result = await circular_scraper.ingest_uploaded_circular(
        Repo(),
        file_bytes=b"not an image",
        title="Road status",
        category="road_status",
        source_url="manual-upload:whatsapp",
        mime_type="image/jpeg",
    )
    assert result["status"] == "rejected"
