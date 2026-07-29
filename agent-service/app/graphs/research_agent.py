"""
Research Agent graph.

Broadened from the original Intel Agent: still Firecrawl-based competitor
scraping, but accepts optional open-ended research_questions and is scoped
to a Project (not just a Workspace) so its output is reusable across every
Campaign under that Project.

Flow:
  scrape_node → extract_node → store_node → END
              ↘ (error)      ↘ (error)
                → END          → END

Each node returns {"error": msg} on failure; the conditional router
short-circuits to END and the last node to detect the error calls mark_failed.
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.nodes.research.scrape_node import scrape_node
from app.nodes.research.extract_node import extract_node
from app.nodes.research.store_node import store_node

logger = logging.getLogger(__name__)


class ResearchState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    project_id: str
    competitor_urls: list[str]
    industry_keywords: str
    research_questions: list[str]
    # ── pipeline state ─────────────────────────────────────────────────────
    scrape_results: list[dict]   # set by scrape_node
    signal_data: dict            # set by extract_node
    signal_id: str               # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route(state: ResearchState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(ResearchState)

    g.add_node("scrape", scrape_node)
    g.add_node("extract", extract_node)
    g.add_node("store", store_node)

    g.set_entry_point("scrape")

    g.add_conditional_edges("scrape", _route, {"continue": "extract", "end": END})
    g.add_conditional_edges("extract", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


async def run_research_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    project_id: str = payload.get("project_id", "")
    competitor_urls: list[str] = payload.get("competitor_urls", [])
    industry_keywords: str = payload.get("industry_keywords", "")
    research_questions: list[str] = payload.get("research_questions", [])

    if not agent_run_id:
        logger.error("run_research_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    if not project_id:
        logger.error("run_research_agent: missing project_id in job %s", job.get("job_id"))
        mark_failed(agent_run_id, "run_research_agent: missing project_id")
        return

    mark_running(agent_run_id)

    initial_state: ResearchState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "competitor_urls": competitor_urls,
        "industry_keywords": industry_keywords,
        "research_questions": research_questions,
        "scrape_results": [],
        "signal_data": {},
        "signal_id": "",
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)

        if final_state.get("error"):
            # store_node already called mark_failed; log for traceability
            logger.error(
                "run_research_agent: pipeline failed agent_run_id=%s error=%s",
                agent_run_id, final_state["error"],
            )
        else:
            logger.info(
                "run_research_agent: complete agent_run_id=%s signal_id=%s",
                agent_run_id, final_state.get("signal_id"),
            )

    except Exception as exc:
        error_msg = f"run_research_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
