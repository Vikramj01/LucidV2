"""
chunk_node: split raw_text into ~500-token chunks with 50-token overlap.

Uses tiktoken cl100k_base encoding (same as OpenAI text-embedding-3-small uses internally).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import tiktoken

if TYPE_CHECKING:
    from app.graphs.vault_ingest import VaultState

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500      # tokens
CHUNK_OVERLAP = 50    # tokens
ENCODING_NAME = "cl100k_base"


def chunk_node(state: "VaultState") -> dict:
    raw_text = state["raw_text"]
    document_id = state["document_id"]

    try:
        chunks = split_into_chunks(raw_text, CHUNK_SIZE, CHUNK_OVERLAP)

        if not chunks:
            error_msg = "chunk_node produced zero chunks"
            _mark_failed(document_id, error_msg)
            return {"error": error_msg}

        logger.info(
            "chunk_node: document_id=%s chunks=%d", document_id, len(chunks)
        )
        return {"chunks": chunks}

    except Exception as exc:
        error_msg = f"chunk_node failed: {exc}"
        logger.exception(error_msg)
        _mark_failed(document_id, error_msg)
        return {"error": error_msg}


def split_into_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    """
    Tokenise text, slide a window of chunk_size tokens with `overlap` overlap,
    decode each window back to a string.
    """
    enc = tiktoken.get_encoding(ENCODING_NAME)
    tokens = enc.encode(text)

    if len(tokens) == 0:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk_text = enc.decode(chunk_tokens).strip()
        if chunk_text:
            chunks.append(chunk_text)
        if end == len(tokens):
            break
        start += chunk_size - overlap

    return chunks


def _mark_failed(document_id: str, error_msg: str) -> None:
    try:
        from app.lib.supabase import get_supabase
        get_supabase().table("vault_documents").update({
            "status": "failed",
            "error_message": error_msg[:2000],
        }).eq("id", document_id).execute()
    except Exception:
        pass
