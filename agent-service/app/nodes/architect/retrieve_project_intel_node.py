"""
retrieve_project_intel_node: load the Project-level intelligence the
Architect Agent synthesises into a playbook — Research (required), ICP
and Market Sizing (both optional, since a Project may not have run those
agents yet). Architect must still work with Research + Brand Voice Vault
alone; missing ICP/Market Sizing is noted for generate_node to flag in
risk_flags rather than blocking the run.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase

if TYPE_CHECKING:
    from app.graphs.architect_agent import ArchitectState

logger = logging.getLogger(__name__)


def retrieve_project_intel_node(state: "ArchitectState") -> dict:
    project_id: str = state["project_id"]
    research_signal_id: str | None = state.get("research_signal_id")
    icp_profile_id: str | None = state.get("icp_profile_id")
    market_sizing_report_id: str | None = state.get("market_sizing_report_id")
    agent_run_id = state["agent_run_id"]

    try:
        db = get_supabase()

        research_query = db.table("research_signals").select("*").eq("project_id", project_id)
        if research_signal_id:
            research_query = research_query.eq("id", research_signal_id)
        else:
            research_query = research_query.order("created_at", desc=True).limit(1)
        research_rows = research_query.execute().data or []

        if not research_rows:
            error_msg = (
                f"No research signal found for project {project_id} — "
                "Architect Agent requires Research to have run at least once"
            )
            logger.error(error_msg)
            return {"error": error_msg}

        research_signal = research_rows[0]

        icp_profile: dict | None = None
        icp_query = db.table("icp_profiles").select("*").eq("project_id", project_id)
        if icp_profile_id:
            icp_query = icp_query.eq("id", icp_profile_id)
        else:
            icp_query = icp_query.order("created_at", desc=True).limit(1)
        icp_rows = icp_query.execute().data or []
        if icp_rows:
            icp_profile = icp_rows[0]
        else:
            logger.warning(
                "retrieve_project_intel_node: no ICP profile for project %s — "
                "proceeding without it", project_id,
            )

        market_sizing_report: dict | None = None
        ms_query = db.table("market_sizing_reports").select("*").eq("project_id", project_id)
        if market_sizing_report_id:
            ms_query = ms_query.eq("id", market_sizing_report_id)
        else:
            ms_query = ms_query.order("created_at", desc=True).limit(1)
        ms_rows = ms_query.execute().data or []
        if ms_rows:
            market_sizing_report = ms_rows[0]
        else:
            logger.warning(
                "retrieve_project_intel_node: no market sizing report for project %s — "
                "proceeding without it", project_id,
            )

        logger.info(
            "retrieve_project_intel_node: agent_run_id=%s research_signal_id=%s "
            "icp_profile_id=%s market_sizing_report_id=%s",
            agent_run_id, research_signal["id"],
            icp_profile["id"] if icp_profile else None,
            market_sizing_report["id"] if market_sizing_report else None,
        )
        return {
            "research_signal": research_signal,
            "research_signal_id": research_signal["id"],
            "icp_profile": icp_profile,
            "icp_profile_id": icp_profile["id"] if icp_profile else None,
            "market_sizing_report": market_sizing_report,
            "market_sizing_report_id": market_sizing_report["id"] if market_sizing_report else None,
        }

    except Exception as exc:
        error_msg = f"retrieve_project_intel_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
