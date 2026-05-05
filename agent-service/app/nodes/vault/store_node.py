"""
store_node: write vault_chunks to Supabase (pgvector), then mark vault_document ready.

Each chunk row: workspace_id, document_id, chunk_index, content, embedding, token_count.
vault_documents.chunk_count and .status are updated on completion.

On any failure the document is marked 'failed'.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import tiktoken

from app.lib.supabase import get_supabase

if TYPE_CHECKING:
    from app.graphs.vault_ingest import VaultState

logger = logging.getLogger(__name__)

ENCODING_NAME = "cl100k_base"
# Supabase JS client has a default row limit per insert; batch to stay safe
INSERT_BATCH_SIZE = 50


def store_node(state: "VaultState") -> dict:
    document_id = state["document_id"]
    workspace_id = state["workspace_id"]
    chunks = state["chunks"]
    embeddings = state["embeddings"]

    if len(chunks) != len(embeddings):
        error_msg = (
            f"Mismatch: {len(chunks)} chunks vs {len(embeddings)} embeddings"
        )
        _mark_failed(document_id, error_msg)
        return {"error": error_msg}

    try:
        enc = tiktoken.get_encoding(ENCODING_NAME)
        db = get_supabase()

        # Build rows
        rows = [
            {
                "workspace_id": workspace_id,
                "document_id": document_id,
                "chunk_index": i,
                "content": chunk,
                "embedding": embedding,
                "token_count": len(enc.encode(chunk)),
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]

        # Delete any existing chunks for this document (idempotent re-ingestion)
        db.table("vault_chunks").delete().eq("document_id", document_id).execute()

        # Insert in batches
        for batch_start in range(0, len(rows), INSERT_BATCH_SIZE):
            batch = rows[batch_start : batch_start + INSERT_BATCH_SIZE]
            result = db.table("vault_chunks").insert(batch).execute()
            if hasattr(result, "error") and result.error:
                raise RuntimeError(f"Insert error: {result.error}")

        # Mark document ready
        db.table("vault_documents").update({
            "status": "ready",
            "chunk_count": len(chunks),
            "error_message": None,
        }).eq("id", document_id).execute()

        logger.info(
            "store_node: document_id=%s workspace_id=%s chunks_stored=%d",
            document_id, workspace_id, len(rows),
        )
        return {}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        _mark_failed(document_id, error_msg)
        return {"error": error_msg}


def _mark_failed(document_id: str, error_msg: str) -> None:
    try:
        get_supabase().table("vault_documents").update({
            "status": "failed",
            "error_message": error_msg[:2000],
        }).eq("id", document_id).execute()
    except Exception:
        pass
