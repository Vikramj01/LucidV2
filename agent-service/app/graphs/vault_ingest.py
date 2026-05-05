"""
Vault ingestion LangGraph graph.

Nodes: extract → chunk → embed → store
Error in any node → mark vault_document as failed and abort.

Entry: run_vault_ingest(job: dict)
"""
from __future__ import annotations

import logging
from typing import TypedDict, Any

from langgraph.graph import StateGraph, END

from app.nodes.vault.extract_node import extract_node
from app.nodes.vault.chunk_node import chunk_node
from app.nodes.vault.embed_node import embed_node
from app.nodes.vault.store_node import store_node
from app.lib.supabase import get_supabase
from app.models.jobs import VaultIngestPayload

logger = logging.getLogger(__name__)


class VaultState(TypedDict):
    # Job inputs
    document_id: str
    workspace_id: str
    source_type: str          # 'pdf' | 'url' | 'free_text'
    file_path: str | None
    url: str | None
    text: str | None

    # Pipeline data
    raw_text: str             # set by extract_node
    chunks: list[str]         # set by chunk_node
    embeddings: list[list[float]]  # set by embed_node

    # Error handling
    error: str | None


def _handle_error(state: VaultState) -> str:
    """Route to END if an error was set."""
    return "end" if state.get("error") else "continue"


def build_graph() -> Any:
    g = StateGraph(VaultState)

    g.add_node("extract", extract_node)
    g.add_node("chunk", chunk_node)
    g.add_node("embed", embed_node)
    g.add_node("store", store_node)

    g.set_entry_point("extract")

    # After each node, route to next or abort on error
    g.add_conditional_edges("extract", _handle_error, {"continue": "chunk", "end": END})
    g.add_conditional_edges("chunk", _handle_error, {"continue": "embed", "end": END})
    g.add_conditional_edges("embed", _handle_error, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = None


async def run_vault_ingest(job: dict) -> None:
    global _graph
    if _graph is None:
        _graph = build_graph()

    payload = VaultIngestPayload(**job.get("payload", {}))
    workspace_id = job["workspace_id"]

    logger.info(
        "Starting vault ingestion: document_id=%s source_type=%s workspace_id=%s",
        payload.document_id,
        payload.source_type,
        workspace_id,
    )

    # Mark document as processing
    get_supabase().table("vault_documents").update(
        {"status": "processing"}
    ).eq("id", payload.document_id).execute()

    initial_state: VaultState = {
        "document_id": payload.document_id,
        "workspace_id": workspace_id,
        "source_type": payload.source_type,
        "file_path": payload.file_path,
        "url": payload.url,
        "text": payload.text,
        "raw_text": "",
        "chunks": [],
        "embeddings": [],
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)
        if final_state.get("error"):
            logger.error(
                "Vault ingestion failed for %s: %s",
                payload.document_id,
                final_state["error"],
            )
        else:
            logger.info("Vault ingestion complete: document_id=%s", payload.document_id)
    except Exception as exc:
        error_msg = f"Unexpected graph error: {exc}"
        logger.exception(error_msg)
        get_supabase().table("vault_documents").update({
            "status": "failed",
            "error_message": error_msg[:2000],
        }).eq("id", payload.document_id).execute()
