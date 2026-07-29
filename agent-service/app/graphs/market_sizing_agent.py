"""
Market Sizing Agent graph.

Estimates TAM/SAM/SOM for a Project's target market, grounded in its
Research Signal and any additional market-data URLs the user supplies.
Scoped to Project (not Campaign) so it's reusable across every Campaign
under that Project.

Flow:
  retrieve_research_node → scrape_node (skipped if no market_data_urls) → estimate_node → store_node → END
                        ↘ (error)     ↘ (error)                        ↘ (error)        ↘ (error)
                          → END          → END                            → END             → END
"""
from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.lib.agent_run import mark_running, mark_failed
from app.nodes.market_sizing.retrieve_research_node import retrieve_research_node
from app.nodes.market_sizing.scrape_node import scrape_node
from app.nodes.market_sizing.estimate_node import estimate_node
from app.nodes.market_sizing.store_node import store_node

logger = logging.getLogger(__name__)


class MarketSizingState(TypedDict):
    # ── inputs ─────────────────────────────────────────────────────────────
    agent_run_id: str
    workspace_id: str
    project_id: str
    research_signal_id: str | None
    market_data_urls: list[str]
    # ── pipeline state ─────────────────────────────────────────────────────
    research_signal: dict        # set by retrieve_research_node
    scraped_sources: list[dict]  # set by scrape_node
    sizing_data: dict             # set by estimate_node
    report_id: str                # set by store_node
    # ── error propagation ──────────────────────────────────────────────────
    error: str | None


def _route_after_retrieve(state: MarketSizingState) -> str:
    if state.get("error"):
        return "end"
    return "scrape" if state.get("market_data_urls") else "estimate"


def _route(state: MarketSizingState) -> str:
    return "end" if state.get("error") else "continue"


def _build_graph() -> StateGraph:
    g = StateGraph(MarketSizingState)

    g.add_node("retrieve_research", retrieve_research_node)
    g.add_node("scrape", scrape_node)
    g.add_node("estimate", estimate_node)
    g.add_node("store", store_node)

    g.set_entry_point("retrieve_research")

    g.add_conditional_edges(
        "retrieve_research", _route_after_retrieve,
        {"scrape": "scrape", "estimate": "estimate", "end": END},
    )
    g.add_conditional_edges("scrape", _route, {"continue": "estimate", "end": END})
    g.add_conditional_edges("estimate", _route, {"continue": "store", "end": END})
    g.add_edge("store", END)

    return g.compile()


_graph = _build_graph()


async def run_market_sizing_agent(job: dict) -> None:
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id", "")
    workspace_id = job.get("workspace_id", "")
    project_id: str = payload.get("project_id", "")
    research_signal_id: str | None = payload.get("research_signal_id")
    market_data_urls: list[str] = payload.get("market_data_urls", [])

    if not agent_run_id:
        logger.error("run_market_sizing_agent: missing agent_run_id in job %s", job.get("job_id"))
        return

    if not project_id:
        logger.error("run_market_sizing_agent: missing project_id in job %s", job.get("job_id"))
        mark_failed(agent_run_id, "run_market_sizing_agent: missing project_id")
        return

    mark_running(agent_run_id)

    initial_state: MarketSizingState = {
        "agent_run_id": agent_run_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
        "research_signal_id": research_signal_id,
        "market_data_urls": market_data_urls,
        "research_signal": {},
        "scraped_sources": [],
        "sizing_data": {},
        "report_id": "",
        "error": None,
    }

    try:
        final_state = await _graph.ainvoke(initial_state)

        if final_state.get("error"):
            logger.error(
                "run_market_sizing_agent: pipeline failed agent_run_id=%s error=%s",
                agent_run_id, final_state["error"],
            )
        else:
            logger.info(
                "run_market_sizing_agent: complete agent_run_id=%s report_id=%s",
                agent_run_id, final_state.get("report_id"),
            )

    except Exception as exc:
        error_msg = f"run_market_sizing_agent unhandled exception: {exc}"
        logger.exception(error_msg)
        mark_failed(agent_run_id, error_msg)
