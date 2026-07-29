"""
Architect Agent graph.

Flow:
  retrieve_project_intel_node → retrieve_vault_node → generate_node → store_node → END
                              ↘ (error)             ↘ (error)       ↘ (error)
                                → END                  → END            → END

retrieve_project_intel_node: loads Research (required) + ICP + Market
                              Sizing (both optional) for the Campaign's Project
retrieve_vault_node:         embed query → retrieve_vault_context RPC → vault_chunks
generate_node:                Claude Sonnet (project intel + vault context) → playbook JSON
store_node:                   insert campaign_playbooks → mark_complete
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.nodes.architect.retrieve_project_intel_node import retrieve_project_intel_node
from app.nodes.architect.retrieve_vault_node import retrieve_vault_node
from app.nodes.architect.generate_node import generate_node
from app.nodes.architect.store_node import store_node

logger = logging.getLogger(__name__)


class ArchitectState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    project_id: str
    campaign_id: str
    research_signal_id: str | None
    icp_profile_id: str | None
    market_sizing_report_id: str | None
    campaign_goal: str
    channels: list[str]
    # ── fetched at runtime by retrieve_project_intel_node ────────────────────
    research_signal: dict
    icp_profile: dict | None
    market_sizing_report: dict | None
    # ── pipeline state ─────────────────────────────────────────────────────
    vault_chunks: list[dict]     # set by retrieve_vault_node
    playbook_data: dict          # set by generate_node
    playbook_id: str             # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route(state: ArchitectState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(ArchitectState)

    g.add_node("retrieve_project_intel", retrieve_project_intel_node)
    g.add_node("retrieve_vault", retrieve_vault_node)
    g.add_node("generate", generate_node)
    g.add_node("store", store_node)

    g.set_entry_point("retrieve_project_intel")

    g.add_conditional_edges("retrieve_project_intel", _route, {"continue": "retrieve_vault", "end": END})
    g.add_conditional_edges("retrieve_vault", _route, {"continue": "generate", "end": END})
    g.add_conditional_edges("generate", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


async def run_architect_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    project_id: str = payload.get("project_id", "")
    campaign_id: str = payload.get("campaign_id", "")
    research_signal_id: str | None = payload.get("research_signal_id")
    icp_profile_id: str | None = payload.get("icp_profile_id")
    market_sizing_report_id: str | None = payload.get("market_sizing_report_id")
    campaign_goal: str = payload.get("campaign_goal", "awareness")
    channels: list[str] = payload.get("channels", [])

    if not agent_run_id:
        logger.error("run_architect_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    if not project_id or not campaign_id:
        error_msg = "run_architect_agent: missing project_id or campaign_id"
        logger.error(error_msg)
        mark_failed(agent_run_id, error_msg)
        return

    mark_running(agent_run_id)

    initial_state: ArchitectState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "campaign_id": campaign_id,
        "research_signal_id": research_signal_id,
        "icp_profile_id": icp_profile_id,
        "market_sizing_report_id": market_sizing_report_id,
        "campaign_goal": campaign_goal,
        "channels": channels,
        "research_signal": {},
        "icp_profile": None,
        "market_sizing_report": None,
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
