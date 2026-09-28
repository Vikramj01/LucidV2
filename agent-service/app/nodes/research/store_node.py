"""
store_node: persist the Research Signal to the research_signals table, record
its credit cost, and mark the agent_run as complete.

Writes:
  research_signals row scoped to workspace_id + project_id
  credit_ledger row (research_run)
  agent_runs.status → 'complete'
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase
from app.lib.agent_run import mark_complete, mark_failed
from app.lib.credits import record_credit

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)


def store_node(state: "ResearchState") -> dict:
    signal: dict = state["signal"]
    workspace_id: str = state["workspace_id"]
    project_id: str = state["project_id"]
    agent_run_id: str = state["agent_run_id"]

    try:
        db = get_supabase()

        signal_id = str(uuid.uuid4())
        row = {
            "id": signal_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "agent_run_id": agent_run_id,
            **signal,
        }

        result = db.table("research_signals").insert(row).execute()
        if hasattr(result, "error") and result.error:
            raise RuntimeError(f"Insert error: {result.error}")

        record_credit(agent_run_id, workspace_id, state["org_id"], "research_run")
        mark_complete(agent_run_id)

        logger.info(
            "store_node: agent_run_id=%s signal_id=%s workspace_id=%s project_id=%s",
            agent_run_id, signal_id, workspace_id, project_id,
        )
        return {"signal_id": signal_id}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return {"error": error_msg}
