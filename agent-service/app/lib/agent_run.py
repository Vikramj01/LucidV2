"""
Helpers for writing agent_run status to the agent_runs table.
Called by all agent graphs at job start, completion, and failure.
"""
from datetime import datetime, timezone
from app.lib.supabase import get_supabase
import logging

logger = logging.getLogger(__name__)


def mark_running(agent_run_id: str) -> None:
    db = get_supabase()
    db.table("agent_runs").update({
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", agent_run_id).execute()


def mark_complete(agent_run_id: str) -> None:
    db = get_supabase()
    db.table("agent_runs").update({
        "status": "complete",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", agent_run_id).execute()


def mark_failed(agent_run_id: str, error_message: str) -> None:
    db = get_supabase()
    db.table("agent_runs").update({
        "status": "failed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": error_message[:2000],   # cap length
    }).eq("id", agent_run_id).execute()
