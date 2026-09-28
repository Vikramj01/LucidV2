"""
Credit ledger writes — every agent action records its cost (MVP1 tracks, never gates).
"""
from __future__ import annotations

import logging

from app.lib.supabase import get_supabase

logger = logging.getLogger(__name__)

# Placeholder costs until pricing is decided; keyed by credit_action_type.
CREDIT_COSTS: dict[str, int] = {
    "research_run": 1,
    "icp_run": 1,
    "market_sizing_run": 1,
    "architect_run": 1,
    "vault_ingest": 1,
}


def record_credit(agent_run_id: str, workspace_id: str, org_id: str, action_type: str) -> None:
    """
    Append a credit_ledger row for a completed agent run and set agent_runs.credits_used.

    Best-effort: a ledger failure is logged but never fails the run, since credits
    are tracked, not gated, in MVP1.
    """
    credits = CREDIT_COSTS[action_type]
    try:
        db = get_supabase()
        run = (
            db.table("agent_runs")
            .select("triggered_by")
            .eq("id", agent_run_id)
            .eq("workspace_id", workspace_id)
            .single()
            .execute()
        )
        if not run.data:
            raise ValueError(f"agent_run {agent_run_id} not found")

        db.table("credit_ledger").insert({
            "org_id": org_id,
            "workspace_id": workspace_id,
            "profile_id": run.data["triggered_by"],
            "agent_run_id": agent_run_id,
            "action_type": action_type,
            "credits_used": credits,
        }).execute()

        db.table("agent_runs").update({"credits_used": credits}).eq("id", agent_run_id).execute()
    except Exception as exc:
        logger.exception(
            "record_credit failed agent_run_id=%s action_type=%s: %s",
            agent_run_id, action_type, exc,
        )
