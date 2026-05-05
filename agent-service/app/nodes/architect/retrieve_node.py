"""
retrieve_node: fetch Brand Voice Vault context for the Architect Agent.

Embeds a retrieval query built from the market signal + campaign goal,
then calls the retrieve_vault_context RPC to get the top-K chunks.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from openai import OpenAI

from app.lib.settings import settings
from app.lib.supabase import get_supabase

if TYPE_CHECKING:
    from app.graphs.architect_agent import ArchitectState

logger = logging.getLogger(__name__)

EMBED_MODEL = "text-embedding-3-small"
TOP_K = 8


def retrieve_node(state: "ArchitectState") -> dict:
    workspace_id: str = state["workspace_id"]
    market_signal: dict = state["market_signal"]
    campaign_goal: str = state["campaign_goal"]
    channels: list[str] = state["channels"]
    agent_run_id: str = state["agent_run_id"]

    try:
        # Build a compact retrieval query from the signal context
        gaps = " ".join(market_signal.get("market_gaps", [])[:3])
        angles = " ".join(market_signal.get("recommended_angles", [])[:3])
        query = (
            f"Campaign goal: {campaign_goal}. "
            f"Channels: {', '.join(channels)}. "
            f"Market gaps: {gaps}. "
            f"Angles: {angles}."
        )

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(model=EMBED_MODEL, input=[query])
        query_embedding: list[float] = response.data[0].embedding

        db = get_supabase()
        result = db.rpc(
            "retrieve_vault_context",
            {
                "p_workspace_id": workspace_id,
                "p_query_embedding": query_embedding,
                "p_top_k": TOP_K,
            },
        ).execute()

        vault_chunks: list[dict] = result.data or []

        logger.info(
            "retrieve_node: agent_run_id=%s vault_chunks=%d",
            agent_run_id, len(vault_chunks),
        )
        return {"vault_chunks": vault_chunks}

    except Exception as exc:
        error_msg = f"retrieve_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
