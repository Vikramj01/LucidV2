"""
retrieve_research_node: load the Research Signal the ICP Agent will build
from — either a specific one passed in, or the Project's latest one.

ICP Agent hard-depends on Research having run at least once for the
Project; there is nothing sensible to build an ICP from otherwise.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase

if TYPE_CHECKING:
    from app.graphs.icp_agent import IcpState

logger = logging.getLogger(__name__)


def retrieve_research_node(state: "IcpState") -> dict:
    project_id: str = state["project_id"]
    research_signal_id: str | None = state.get("research_signal_id")
    agent_run_id = state["agent_run_id"]

    try:
        db = get_supabase()
        query = db.table("research_signals").select("*").eq("project_id", project_id)

        if research_signal_id:
            query = query.eq("id", research_signal_id)
        else:
            query = query.order("created_at", desc=True).limit(1)

        result = query.execute()
        rows = result.data or []

        if not rows:
            error_msg = (
                f"No research signal found for project {project_id}"
                f"{f' (id={research_signal_id})' if research_signal_id else ''} — "
                "run the Research Agent first"
            )
            logger.error(error_msg)
            return {"error": error_msg}

        research_signal = rows[0]

        logger.info(
            "retrieve_research_node: agent_run_id=%s research_signal_id=%s",
            agent_run_id, research_signal["id"],
        )
        return {
            "research_signal": research_signal,
            "research_signal_id": research_signal["id"],
        }

    except Exception as exc:
        error_msg = f"retrieve_research_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
