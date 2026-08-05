"""
synthesise_node: compare the extracted competitor_profiles against each
other (and the brand's industry keywords / open research questions) to
surface market gaps, buying-intent signals, and angles the client could
own. This is the cross-competitor analysis step that v1.0's extract_node
used to do in the same Claude call as per-competitor extraction — split
out here per PRD §8's graph so each node has one job.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import anthropic

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 2048

SYSTEM_PROMPT = """\
You are a B2B market intelligence analyst. You will be given structured profiles \
for several competitors (their messaging, target audience, content themes, and \
CTAs), plus industry keywords and optionally some open-ended research questions. \
Compare the competitors against each other and return ONLY a valid JSON object — \
no markdown fences, no explanation.

The JSON must match this exact schema:
{
  "market_gaps": ["<unmet need or underserved segment>", ...],
  "intent_triggers": ["<buying signal or pain point indicating purchase intent>", ...],
  "recommended_angles": ["<differentiated positioning angle the client could own>", ...]
}

Rules:
- market_gaps: 3-6 unmet needs or underserved segments visible from comparing all competitors
- intent_triggers: 3-6 buying signals or pain points that indicate purchase intent
- recommended_angles: 3-5 differentiated positioning angles, each one a gap none of \
the competitors are already occupying
- If open-ended research questions were provided, address them directly within \
these three lists rather than as separate output
- All strings must be concise (under 150 characters)
- Return only JSON, nothing else
"""


def synthesise_node(state: "ResearchState") -> dict:
    competitor_profiles: list[dict] = state["competitor_profiles"]
    industry_keywords: str = state["industry_keywords"]
    research_questions: str = state.get("research_questions", "")
    agent_run_id = state["agent_run_id"]

    try:
        sections: list[str] = [f"Industry keywords: {industry_keywords}\n"]
        if research_questions:
            sections.append(f"Open-ended research questions: {research_questions}\n")
        sections.append(f"Competitor profiles:\n{json.dumps(competitor_profiles, indent=2)}")

        user_content = "\n\n".join(sections)

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_json = message.content[0].text.strip()

        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
            raw_json = raw_json.strip()

        synthesis_data = json.loads(raw_json)

        required = {"market_gaps", "intent_triggers", "recommended_angles"}
        missing = required - set(synthesis_data.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")

        logger.info(
            "synthesise_node: agent_run_id=%s gaps=%d triggers=%d angles=%d",
            agent_run_id,
            len(synthesis_data["market_gaps"]),
            len(synthesis_data["intent_triggers"]),
            len(synthesis_data["recommended_angles"]),
        )
        return {"synthesis_data": synthesis_data}

    except json.JSONDecodeError as exc:
        error_msg = f"synthesise_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"synthesise_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
