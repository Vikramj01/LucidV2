"""
write_node: assemble the final Research Signal JSON object from the
extract_node and synthesise_node outputs. Pure formatting — no LLM call,
no I/O — matching PRD §4.4's "Formats output as a structured Research
Signal JSON object" step, kept separate from store_node so the shape being
persisted is decided in one place independent of how it gets written.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)


def write_node(state: "ResearchState") -> dict:
    competitor_profiles: list[dict] = state["competitor_profiles"]
    synthesis_data: dict = state["synthesis_data"]
    scrape_results: list[dict] = state["scrape_results"]
    agent_run_id = state["agent_run_id"]

    try:
        sources = [r["url"] for r in scrape_results]

        research_signal = {
            "competitors_analysed": sources,
            "competitor_profiles": competitor_profiles,
            "market_gaps": synthesis_data["market_gaps"],
            "intent_triggers": synthesis_data["intent_triggers"],
            "recommended_angles": synthesis_data["recommended_angles"],
            "sources": sources,
        }

        logger.info("write_node: agent_run_id=%s assembled research_signal", agent_run_id)
        return {"research_signal": research_signal}

    except Exception as exc:
        error_msg = f"write_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
