"""
store_node: persist the generated Campaign Playbook to campaign_playbooks
and mark the agent_run as complete.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.lib.supabase import get_supabase
from app.lib.agent_run import mark_complete, mark_failed

if TYPE_CHECKING:
    from app.graphs.architect_agent import ArchitectState

logger = logging.getLogger(__name__)


def store_node(state: "ArchitectState") -> dict:
    playbook_data: dict = state["playbook_data"]
    workspace_id: str = state["workspace_id"]
    agent_run_id: str = state["agent_run_id"]
    market_signal_id: str = state["market_signal_id"]
    campaign_goal: str = state["campaign_goal"]
    channels: list[str] = state["channels"]

    try:
        db = get_supabase()
        playbook_id = str(uuid.uuid4())

        row = {
            "id": playbook_id,
            "workspace_id": workspace_id,
            "agent_run_id": agent_run_id,
            "market_signal_id": market_signal_id or None,
            "campaign_goal": campaign_goal,
            "channels": channels,
            "winning_angle": playbook_data["winning_angle"],
            "target_persona": playbook_data["target_persona"],
            "playbook_content": playbook_data["playbook_content"],
            "status": "draft",
            "version": 1,
        }

        result = db.table("campaign_playbooks").insert(row).execute()
        if hasattr(result, "error") and result.error:
            raise RuntimeError(f"Insert error: {result.error}")

        mark_complete(agent_run_id)

        logger.info(
            "store_node: agent_run_id=%s playbook_id=%s workspace_id=%s",
            agent_run_id, playbook_id, workspace_id,
        )
        return {"playbook_id": playbook_id}

    except Exception as exc:
        error_msg = f"store_node failed: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return {"error": error_msg}
