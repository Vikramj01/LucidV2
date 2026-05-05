"""
Architect Agent graph — Sprint 5.

Flow:
  retrieve_node → generate_node → store_node → END
               ↘ (error)        ↘ (error)
                 → END            → END

retrieve_node: embed query → retrieve_vault_context RPC → vault_chunks
generate_node: Claude Sonnet (market signal + vault context) → playbook JSON
store_node:    insert campaign_playbooks → mark_complete
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.lib.supabase import get_supabase
from app.nodes.architect.retrieve_node import retrieve_node
from app.nodes.architect.generate_node import generate_node
from app.nodes.architect.store_node import store_node

logger = logging.getLogger(__name__)


class ArchitectState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    market_signal_id: str
    campaign_goal: str
    channels: list[str]
    # ── fetched at runtime ─────────────────────────────────────────────────
    market_signal: dict          # loaded from market_signals table
    # ── pipeline state ─────────────────────────────────────────────────────
    vault_chunks: list[dict]     # set by retrieve_node
    playbook_data: dict          # set by generate_node
    playbook_id: str             # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route(state: ArchitectState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(ArchitectState)

    g.add_node("retrieve", retrieve_node)
    g.add_node("generate", generate_node)
    g.add_node("store", store_node)

    g.set_entry_point("retrieve")

    g.add_conditional_edges("retrieve", _route, {"continue": "generate", "end": END})
    g.add_conditional_edges("generate", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


def _load_market_signal(market_signal_id: str, workspace_id: str) -> dict:
    """Fetch the market_signals row; raises on not found."""
    db = get_supabase()
    result = (
        db.table("market_signals")
        .select("*")
        .eq("id", market_signal_id)
        .eq("workspace_id", workspace_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError(f"market_signal {market_signal_id} not found for workspace {workspace_id}")
    return result.data


async def run_architect_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    market_signal_id: str = payload.get("market_signal_id", "")
    campaign_goal: str = payload.get("campaign_goal", "awareness")
    channels: list[str] = payload.get("channels", [])

    if not agent_run_id:
        logger.error("run_architect_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    mark_running(agent_run_id)

    try:
        market_signal = _load_market_signal(market_signal_id, workspace_id)
    except Exception as exc:
        error_msg = f"run_architect_agent: could not load market signal — {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return

    initial_state: ArchitectState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "market_signal_id": market_signal_id,
        "campaign_goal": campaign_goal,
        "channels": channels,
        "market_signal": market_signal,
        "vault_chunks": [],
        "playbook_data": {},
        "playbook_id": "",
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)

        if final_state.get("error"):
            logger.error(
                "run_architect_agent: pipeline failed agent_run_id=%s error=%s",
                agent_run_id, final_state["error"],
            )
        else:
            logger.info(
                "run_architect_agent: complete agent_run_id=%s playbook_id=%s",
                agent_run_id, final_state.get("playbook_id"),
            )

    except Exception as exc:
        error_msg = f"run_architect_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
