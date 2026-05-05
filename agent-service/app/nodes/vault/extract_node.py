"""
extract_node: pull raw text out of the source.

- pdf       → download from Supabase Storage, parse with pypdf
- url       → scrape with Firecrawl
- free_text → pass straight through
"""
from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import pypdf
from firecrawl import FirecrawlApp

from app.lib.settings import settings
from app.lib.supabase import get_supabase

if TYPE_CHECKING:
    from app.graphs.vault_ingest import VaultState

logger = logging.getLogger(__name__)

VAULT_BUCKET = "vault-documents"


def extract_node(state: "VaultState") -> dict:
    source_type = state["source_type"]
    document_id = state["document_id"]

    try:
        if source_type == "pdf":
            raw_text = _extract_pdf(state["file_path"])
        elif source_type == "url":
            raw_text = _extract_url(state["url"])
        elif source_type == "free_text":
            raw_text = (state["text"] or "").strip()
        else:
            return {"error": f"Unknown source_type: {source_type}"}

        if not raw_text:
            return {"error": "Extraction produced empty text"}

        logger.info(
            "extract_node: document_id=%s source=%s chars=%d",
            document_id, source_type, len(raw_text),
        )
        return {"raw_text": raw_text}

    except Exception as exc:
        error_msg = f"extract_node failed: {exc}"
        logger.exception(error_msg)
        _mark_failed(document_id, error_msg)
        return {"error": error_msg}


def _extract_pdf(file_path: str | None) -> str:
    if not file_path:
        raise ValueError("file_path is required for PDF extraction")

    db = get_supabase()
    response = db.storage.from_(VAULT_BUCKET).download(file_path)
    # response is bytes
    reader = pypdf.PdfReader(io.BytesIO(response))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def _extract_url(url: str | None) -> str:
    if not url:
        raise ValueError("url is required for URL extraction")

    app = FirecrawlApp(api_key=settings.firecrawl_api_key)
    result = app.scrape_url(url, formats=["markdown"])
    # firecrawl returns a ScrapeResponse object
    markdown = getattr(result, "markdown", None) or ""
    return markdown.strip()


def _mark_failed(document_id: str, error_msg: str) -> None:
    try:
        get_supabase().table("vault_documents").update({
            "status": "failed",
            "error_message": error_msg[:2000],
        }).eq("id", document_id).execute()
    except Exception:
        pass
