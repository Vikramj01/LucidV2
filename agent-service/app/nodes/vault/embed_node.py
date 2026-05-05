"""
embed_node: generate OpenAI text-embedding-3-small embeddings for each chunk.

Batches requests (max 100 chunks per API call) with exponential backoff on
rate limit errors. Embedding dimension: 1536.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from openai import OpenAI, RateLimitError

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.vault_ingest import VaultState

logger = logging.getLogger(__name__)

EMBED_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100          # max chunks per API call
MAX_RETRIES = 5
BASE_BACKOFF = 1.0        # seconds


def embed_node(state: "VaultState") -> dict:
    chunks = state["chunks"]
    document_id = state["document_id"]

    try:
        embeddings = embed_texts(chunks)
        logger.info(
            "embed_node: document_id=%s embeddings=%d dim=%d",
            document_id, len(embeddings), len(embeddings[0]) if embeddings else 0,
        )
        return {"embeddings": embeddings}

    except Exception as exc:
        error_msg = f"embed_node failed: {exc}"
        logger.exception(error_msg)
        _mark_failed(document_id, error_msg)
        return {"error": error_msg}


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed all texts in batches. Returns list of 1536-dim float vectors."""
    client = OpenAI(api_key=settings.openai_api_key)
    all_embeddings: list[list[float]] = []

    for batch_start in range(0, len(texts), BATCH_SIZE):
        batch = texts[batch_start : batch_start + BATCH_SIZE]
        # Replace newlines — OpenAI recommends this for embeddings
        batch = [t.replace("\n", " ") for t in batch]

        vectors = _embed_with_backoff(client, batch)
        all_embeddings.extend(vectors)

    return all_embeddings


def _embed_with_backoff(client: OpenAI, texts: list[str]) -> list[list[float]]:
    backoff = BASE_BACKOFF
    for attempt in range(MAX_RETRIES):
        try:
            response = client.embeddings.create(
                model=EMBED_MODEL,
                input=texts,
            )
            return [item.embedding for item in response.data]

        except RateLimitError:
            if attempt == MAX_RETRIES - 1:
                raise
            logger.warning(
                "Rate limit hit — backing off %.1fs (attempt %d/%d)",
                backoff, attempt + 1, MAX_RETRIES,
            )
            time.sleep(backoff)
            backoff = min(backoff * 2, 60.0)

    raise RuntimeError("Embedding failed after max retries")


def _mark_failed(document_id: str, error_msg: str) -> None:
    try:
        from app.lib.supabase import get_supabase
        get_supabase().table("vault_documents").update({
            "status": "failed",
            "error_message": error_msg[:2000],
        }).eq("id", document_id).execute()
    except Exception:
        pass
