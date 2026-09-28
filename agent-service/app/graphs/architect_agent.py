"""
Architect Agent graph — Sprint 5, repointed to research_signals in Sprint 10
(full v2.0 rework with ICP / Market Sizing inputs lands in Sprint 12).

Flow:
  retrieve_node → generate_node → store_node → END
               ↘ (error)        ↘ (error)
                 → END            → END

retrieve_node: embed query → retrieve_vault_context RPC → vault_chunks
generate_node: Claude Sonnet (research signal + vault context) → playbook JSON
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
    org_id: str
    project_id: str
    campaign_id: str
    campaign_goal: str
    channels: list[str]
    # ── fetched at runtime ─────────────────────────────────────────────────
    research_signal: dict        # loaded from research_signals table
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


def _load_research_signal(
    workspace_id: str, project_id: str, research_signal_id: str | None
) -> dict:
    """Fetch the given research signal, or the Project's latest if none given; raises if absent."""
    db = get_supabase()
    query = (
        db.table("research_signals")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("project_id", project_id)
    )
    if research_signal_id:
        query = query.eq("id", research_signal_id)
    else:
        query = query.order("created_at", desc=True)
    result = query.limit(1).execute()
    if not result.data:
        target = research_signal_id or "latest"
        raise ValueError(f"research signal ({target}) not found for project {project_id}")
    return result.data[0]


async def run_architect_agent(job: dict) -> None:
    """Run the Architect graph for a validated architect_run job (see worker.dispatch)."""
    payload = job["payload"]
    agent_run_id: str = payload["agent_run_id"]
    workspace_id: str = job["workspace_id"]
    project_id: str = payload["project_id"]

    mark_running(agent_run_id)

    try:
        research_signal = _load_research_signal(
            workspace_id, project_id, payload.get("research_signal_id")
        )
    except Exception as exc:
        error_msg = f"run_architect_agent: could not load research signal — {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return

    initial_state: ArchitectState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "org_id": job["org_id"],
        "project_id": project_id,
        "campaign_id": payload["campaign_id"],
        "campaign_goal": payload["campaign_goal"],
        "channels": payload["channels"],
        "research_signal": research_signal,
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
            mark_failed(agent_run_id, final_state["error"])
        else:
            logger.info(
                "run_architect_agent: complete agent_run_id=%s playbook_id=%s",
                agent_run_id, final_state.get("playbook_id"),
            )

    except Exception as exc:
        error_msg = f"run_architect_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
