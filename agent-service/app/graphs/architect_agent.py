"""
Architect Agent graph — Sprint 5, minimal schema sync in Sprint 10.

Flow:
  retrieve_node → generate_node → store_node → END
               ↘ (error)        ↘ (error)
                 → END            → END

retrieve_node: embed query → retrieve_vault_context RPC → vault_chunks
generate_node: Claude Sonnet (research signal + vault context) → playbook JSON
store_node:    insert campaign_playbooks → mark_complete

NOTE: this is still the v1.0 graph shape — Campaign-level trigger plumbing
(project_id/campaign_id/research_signal_id naming) was fixed here so the
agent runs at all against the Sprint 8/9 schema, but the actual v2.0
feature work (optional ICP/Market Sizing inputs with graceful degradation,
risk_flags, retrieve_project_intel_node combining all three) is Sprint 13.
Until then, research_signal_id must be supplied explicitly by the caller —
there's no "use the Project's latest Research Signal" fallback yet.
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
    project_id: str
    campaign_id: str
    research_signal_id: str
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


def _load_research_signal(research_signal_id: str, project_id: str) -> dict:
    """Fetch the research_signals row; raises on not found."""
    if not research_signal_id:
        raise ValueError(
            "research_signal_id is required (no 'use Project's latest' fallback until Sprint 13)"
        )

    db = get_supabase()
    result = (
        db.table("research_signals")
        .select("*")
        .eq("id", research_signal_id)
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError(f"research_signal {research_signal_id} not found for project {project_id}")
    return result.data


async def run_architect_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    project_id: str = payload.get("project_id", "")
    campaign_id: str = payload.get("campaign_id", "")
    research_signal_id: str = payload.get("research_signal_id") or ""
    campaign_goal: str = payload.get("campaign_goal", "awareness")
    channels: list[str] = payload.get("channels", [])

    if not agent_run_id:
        logger.error("run_architect_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    mark_running(agent_run_id)

    if not project_id or not campaign_id:
        error_msg = "run_architect_agent: missing project_id or campaign_id in job payload"
        logger.error(error_msg)
        mark_failed(agent_run_id, error_msg)
        return

    try:
        research_signal = _load_research_signal(research_signal_id, project_id)
    except Exception as exc:
        error_msg = f"run_architect_agent: could not load research signal — {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
        return

    initial_state: ArchitectState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "campaign_id": campaign_id,
        "research_signal_id": research_signal_id,
        "campaign_goal": campaign_goal,
        "channels": channels,
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
            # See research_agent.py — store_node only calls mark_failed on its
            # own DB error; an earlier node failing needs this catch-all too.
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
