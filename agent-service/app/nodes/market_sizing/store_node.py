"""
store_node: persist the generated Market Sizing Report to
market_sizing_reports and mark the agent_run as complete.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase
from app.lib.agent_run import mark_complete, mark_failed

if TYPE_CHECKING:
    from app.graphs.market_sizing_agent import MarketSizingState

logger = logging.getLogger(__name__)


def store_node(state: "MarketSizingState") -> dict:
    sizing_data: dict = state["sizing_data"]
    workspace_id: str = state["workspace_id"]
    project_id: str = state["project_id"]
    agent_run_id: str = state["agent_run_id"]
    research_signal_id: str = state["research_signal_id"]

    try:
        db = get_supabase()
        report_id = str(uuid.uuid4())

        row = {
            "id": report_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "agent_run_id": agent_run_id,
            "research_signal_id": research_signal_id or None,
            "tam_estimate": sizing_data["tam_estimate"],
            "sam_estimate": sizing_data["sam_estimate"],
            "som_estimate": sizing_data["som_estimate"],
            "methodology_notes": sizing_data["methodology_notes"],
            "sources": sizing_data["sources"],
        }

        result = db.table("market_sizing_reports").insert(row).execute()
        if hasattr(result, "error") and result.error:
            raise RuntimeError(f"Insert error: {result.error}")

        mark_complete(agent_run_id)

        logger.info(
            "store_node: agent_run_id=%s report_id=%s project_id=%s",
            agent_run_id, report_id, project_id,
        )
        return {"report_id": report_id}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return {"error": error_msg}
