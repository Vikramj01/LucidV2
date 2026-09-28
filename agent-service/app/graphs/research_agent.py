"""
Research Agent graph (v2.0 — replaces v1.0's Intel Agent).

Flow:
  scrape_node → extract_node → synthesise_node → write_node → store_node → END
       ↘ (error)     ↘ (error)        ↘ (error)        ↘ (error)
         → END         → END            → END            → END

Each node returns {"error": msg} on failure; the conditional router
short-circuits to END and run_research_agent marks the run failed.
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.nodes.research.scrape_node import scrape_node
from app.nodes.research.extract_node import extract_node
from app.nodes.research.synthesise_node import synthesise_node
from app.nodes.research.write_node import write_node
from app.nodes.research.store_node import store_node

logger = logging.getLogger(__name__)


class ResearchState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    org_id: str
    project_id: str
    competitor_urls: list[str]
    industry_keywords: str
    research_questions: list[str]
    # ── pipeline state ─────────────────────────────────────────────────────
    scrape_results: list[dict]       # set by scrape_node
    competitor_profiles: list[dict]  # set by extract_node
    synthesis: dict                  # set by synthesise_node
    signal: dict                     # set by write_node
    signal_id: str                   # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route(state: ResearchState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(ResearchState)

    g.add_node("scrape", scrape_node)
    g.add_node("extract", extract_node)
    g.add_node("synthesise", synthesise_node)
    g.add_node("write", write_node)
    g.add_node("store", store_node)

    g.set_entry_point("scrape")

    g.add_conditional_edges("scrape", _route, {"continue": "extract", "end": END})
    g.add_conditional_edges("extract", _route, {"continue": "synthesise", "end": END})
    g.add_conditional_edges("synthesise", _route, {"continue": "write", "end": END})
    g.add_conditional_edges("write", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


async def run_research_agent(job: dict) -> None:
    """Run the Research graph for a validated research_run job (see worker.dispatch)."""
    payload = job["payload"]
    agent_run_id: str = payload["agent_run_id"]

    mark_running(agent_run_id)

    initial_state: ResearchState = {
        "agent_run_id": agent_run_id,
        "workspace_id": job["workspace_id"],
        "org_id": job["org_id"],
        "project_id": payload["project_id"],
        "competitor_urls": payload["competitor_urls"],
        "industry_keywords": payload.get("industry_keywords", ""),
        "research_questions": payload.get("research_questions", []),
        "scrape_results": [],
        "competitor_profiles": [],
        "synthesis": {},
        "signal": {},
        "signal_id": "",
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)

        if final_state.get("error"):
            logger.error(
                "run_research_agent: pipeline failed agent_run_id=%s error=%s",
                agent_run_id, final_state["error"],
            )
            mark_failed(agent_run_id, final_state["error"])
        else:
            logger.info(
                "run_research_agent: complete agent_run_id=%s signal_id=%s",
                agent_run_id, final_state.get("signal_id"),
            )

    except Exception as exc:
        error_msg = f"run_research_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
