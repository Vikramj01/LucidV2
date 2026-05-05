"""
store_node: persist the extracted MarketSignal to the market_signals table
and mark the agent_run as complete.

Writes:
  market_signals row with all extracted fields
  agent_runs.status → 'complete', output_summary = signal id
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase
from app.lib.agent_run import mark_complete, mark_failed

if TYPE_CHECKING:
    from app.graphs.intel_agent import IntelState

logger = logging.getLogger(__name__)


def store_node(state: "IntelState") -> dict:
    signal_data: dict = state["signal_data"]
    workspace_id: str = state["workspace_id"]
    agent_run_id: str = state["agent_run_id"]
    scrape_results: list[dict] = state["scrape_results"]

    try:
        db = get_supabase()

        signal_id = str(uuid.uuid4())
        sources = [r["url"] for r in scrape_results]

        row = {
            "id": signal_id,
            "workspace_id": workspace_id,
            "agent_run_id": agent_run_id,
            "competitors_analysed": sources,
            "competitor_profiles": signal_data["competitor_profiles"],
            "market_gaps": signal_data["market_gaps"],
            "intent_triggers": signal_data["intent_triggers"],
            "recommended_angles": signal_data["recommended_angles"],
            "sources": sources,
        }

        result = db.table("market_signals").insert(row).execute()
        if hasattr(result, "error") and result.error:
            raise RuntimeError(f"Insert error: {result.error}")

        mark_complete(agent_run_id)

        logger.info(
            "store_node: agent_run_id=%s signal_id=%s workspace_id=%s",
            agent_run_id, signal_id, workspace_id,
        )
        return {"signal_id": signal_id}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return {"error": error_msg}
