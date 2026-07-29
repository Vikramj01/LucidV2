"""
ICP Agent graph.

Builds Ideal Customer Profiles from a Project's Research Signal plus Brand
Voice Vault context. Scoped to Project (not Campaign) so it's reusable
across every Campaign under that Project.

Flow:
  retrieve_research_node → retrieve_vault_node → generate_node → store_node → END
                        ↘ (error)             ↘ (error)        ↘ (error)
                          → END                  → END             → END
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.nodes.icp.retrieve_research_node import retrieve_research_node
from app.nodes.icp.retrieve_vault_node import retrieve_vault_node
from app.nodes.icp.generate_node import generate_node
from app.nodes.icp.store_node import store_node

logger = logging.getLogger(__name__)


class IcpState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    project_id: str
    research_signal_id: str | None
    # ── pipeline state ─────────────────────────────────────────────────────
    research_signal: dict        # set by retrieve_research_node
    vault_chunks: list[dict]     # set by retrieve_vault_node
    icp_data: dict                # set by generate_node
    icp_id: str                   # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route(state: IcpState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(IcpState)

    g.add_node("retrieve_research", retrieve_research_node)
    g.add_node("retrieve_vault", retrieve_vault_node)
    g.add_node("generate", generate_node)
    g.add_node("store", store_node)

    g.set_entry_point("retrieve_research")

    g.add_conditional_edges("retrieve_research", _route, {"continue": "retrieve_vault", "end": END})
    g.add_conditional_edges("retrieve_vault", _route, {"continue": "generate", "end": END})
    g.add_conditional_edges("generate", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


async def run_icp_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    project_id: str = payload.get("project_id", "")
    research_signal_id: str | None = payload.get("research_signal_id")

    if not agent_run_id:
        logger.error("run_icp_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    if not project_id:
        logger.error("run_icp_agent: missing project_id in job %s", job.get("job_id"))
        mark_failed(agent_run_id, "run_icp_agent: missing project_id")
        return

    mark_running(agent_run_id)

    initial_state: IcpState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "research_signal_id": research_signal_id,
        "research_signal": {},
        "vault_chunks": [],
        "icp_data": {},
        "icp_id": "",
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)

        if final_state.get("error"):
            logger.error(
                "run_icp_agent: pipeline failed agent_run_id=%s error=%s",
                agent_run_id, final_state["error"],
            )
        else:
            logger.info(
                "run_icp_agent: complete agent_run_id=%s icp_id=%s",
                agent_run_id, final_state.get("icp_id"),
            )

    except Exception as exc:
        error_msg = f"run_icp_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
