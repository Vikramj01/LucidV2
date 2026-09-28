"""
write_node: assemble and validate the Research Signal from the extracted
competitor profiles and the cross-competitor synthesis. No LLM call.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic import ValidationError

from app.models.outputs import ResearchSignal

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)


def write_node(state: "ResearchState") -> dict:
    profiles: list[dict] = state["competitor_profiles"]
    synthesis: dict = state["synthesis"]
    agent_run_id = state["agent_run_id"]

    try:
        analysed = [p["url"] for p in profiles]
        finding_sources = [
            url
            for finding in synthesis.get("research_findings", [])
            for url in finding.get("sources", [])
        ]
        # Cite every competitor analysed, plus any extra URL a finding cites.
        sources = list(dict.fromkeys(analysed + finding_sources))

        signal = ResearchSignal(
            competitors_analysed=analysed,
            competitor_profiles=profiles,
            market_gaps=synthesis["market_gaps"],
            intent_triggers=synthesis["intent_triggers"],
            recommended_angles=synthesis["recommended_angles"],
            research_questions=state["research_questions"],
            research_findings=synthesis.get("research_findings", []),
            sources=sources,
        )

        logger.info("write_node: agent_run_id=%s sources=%d", agent_run_id, len(sources))
        return {"signal": signal.model_dump()}

    except (ValidationError, KeyError) as exc:
        error_msg = f"write_node: research signal failed validation — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
