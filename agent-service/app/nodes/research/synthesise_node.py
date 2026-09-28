"""
synthesise_node: one Claude Sonnet call across all competitor profiles to find
market gaps, intent triggers and positioning angles, and to answer any
open-ended research questions from the gathered evidence.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from app.lib.llm import complete_json

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)

MAX_TOKENS = 4096

SYSTEM_PROMPT = """\
You are a senior B2B market strategist. You will be given structured profiles of \
several competitors, the industry keywords, and optionally some open research \
questions. Compare the competitors against each other and return ONLY a valid \
JSON object — no markdown fences, no explanation.

The JSON must match this exact schema:
{
  "market_gaps": ["<gap>", ...],
  "intent_triggers": ["<trigger>", ...],
  "recommended_angles": ["<angle>", ...],
  "research_findings": [
    {"question": "<question verbatim>", "answer": "<answer>", "sources": ["<url>", ...]}
  ]
}

Rules:
- market_gaps: 3–6 unmet needs or underserved segments visible across the landscape
- intent_triggers: 3–6 buying signals or pain points that indicate purchase intent
- recommended_angles: 3–5 differentiated positioning angles a new entrant could own
- research_findings: one entry per research question given, in the same order; \
answer only from the competitor evidence and say so plainly if the evidence is \
insufficient; sources are the competitor URLs the answer draws on. Empty list if \
no questions were given.
- All list items must be concise (under 150 characters); answers under 600 characters
- Return only JSON, nothing else
"""

REQUIRED_KEYS = {"market_gaps", "intent_triggers", "recommended_angles"}


def synthesise_node(state: "ResearchState") -> dict:
    profiles: list[dict] = state["competitor_profiles"]
    industry_keywords: str = state["industry_keywords"]
    research_questions: list[str] = state["research_questions"]
    agent_run_id = state["agent_run_id"]

    try:
        parts = [
            f"Industry keywords: {industry_keywords or '(none given)'}",
            "Research questions:\n" + (
                "\n".join(f"- {q}" for q in research_questions) if research_questions else "(none)"
            ),
            "Competitor profiles:\n" + json.dumps(profiles, indent=2),
        ]
        synthesis = complete_json(SYSTEM_PROMPT, "\n\n".join(parts), MAX_TOKENS)

        missing = REQUIRED_KEYS - set(synthesis.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")
        if not research_questions:
            synthesis["research_findings"] = []
        synthesis.setdefault("research_findings", [])

        logger.info(
            "synthesise_node: agent_run_id=%s gaps=%d angles=%d findings=%d",
            agent_run_id,
            len(synthesis["market_gaps"]),
            len(synthesis["recommended_angles"]),
            len(synthesis["research_findings"]),
        )
        return {"synthesis": synthesis}

    except Exception as exc:
        error_msg = f"synthesise_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
