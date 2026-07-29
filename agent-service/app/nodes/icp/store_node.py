"""
store_node: persist the generated ICP Profile to icp_profiles and mark
the agent_run as complete.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase
from app.lib.agent_run import mark_complete, mark_failed

if TYPE_CHECKING:
    from app.graphs.icp_agent import IcpState

logger = logging.getLogger(__name__)


def store_node(state: "IcpState") -> dict:
    icp_data: dict = state["icp_data"]
    workspace_id: str = state["workspace_id"]
    project_id: str = state["project_id"]
    agent_run_id: str = state["agent_run_id"]
    research_signal_id: str = state["research_signal_id"]

    try:
        db = get_supabase()
        icp_id = str(uuid.uuid4())

        row = {
            "id": icp_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "agent_run_id": agent_run_id,
            "research_signal_id": research_signal_id or None,
            "firmographics": icp_data["firmographics"],
            "personas": icp_data["personas"],
            "pain_points": icp_data["pain_points"],
            "buying_triggers": icp_data["buying_triggers"],
            "sources": icp_data["sources"],
        }

        result = db.table("icp_profiles").insert(row).execute()
        if hasattr(result, "error") and result.error:
            raise RuntimeError(f"Insert error: {result.error}")

        mark_complete(agent_run_id)

        logger.info(
            "store_node: agent_run_id=%s icp_id=%s project_id=%s",
            agent_run_id, icp_id, project_id,
        )
        return {"icp_id": icp_id}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return {"error": error_msg}
