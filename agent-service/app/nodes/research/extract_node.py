"""
extract_node: send scraped competitor content to Claude Sonnet and extract
a per-competitor CompetitorProfile array.

Output shape matches shared/types/index.ts CompetitorProfile and PRD §4.4's
Research Signal schema exactly (the v1.0 Intel Agent's extract_node used a
different, never-aligned shape — name/positioning/key_messages/icp/
weaknesses — this replaces it):
  competitor_profiles: list[{url, key_messaging, target_audience, content_themes, primary_cta}]

Cross-competitor synthesis (market_gaps/intent_triggers/recommended_angles)
is no longer done here — see synthesise_node.
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
MAX_TOKENS = 4096

SYSTEM_PROMPT = """\
You are a B2B market intelligence analyst. You will be given scraped content from \
competitor websites, and optionally some open-ended research questions the marketer \
wants addressed. Analyse the content and return ONLY a valid JSON object — no \
markdown fences, no explanation.

The JSON must match this exact schema:
{
  "competitor_profiles": [
    {
      "url": "<the competitor's URL, exactly as given>",
      "key_messaging": ["<key message or tagline>", ...],
      "target_audience": "<who this competitor is selling to, one sentence>",
      "content_themes": ["<recurring content theme>", ...],
      "primary_cta": "<their main call to action>"
    }
  ]
}

Rules:
- One entry per competitor, in the same order as the content is provided
- key_messaging: 2-5 items, based only on the provided content
- content_themes: 2-5 recurring topics/themes visible in their content
- If open-ended research questions are provided, let them guide which aspects of \
each competitor's messaging and positioning you emphasize — but still extract all \
five fields for every competitor regardless
- All strings must be concise (under 150 characters)
- Return only JSON, nothing else
"""


def extract_node(state: "ResearchState") -> dict:
    scrape_results: list[dict] = state["scrape_results"]
    industry_keywords: str = state["industry_keywords"]
    research_questions: str = state.get("research_questions", "")
    agent_run_id = state["agent_run_id"]

    try:
        # Build the user message — concatenate all scraped pages
        sections: list[str] = [f"Industry keywords: {industry_keywords}\n"]
        if research_questions:
            sections.append(f"Open-ended research questions to keep in mind: {research_questions}\n")
        for r in scrape_results:
            title = r.get("title") or r["url"]
            content = (r.get("markdown") or "").strip()
            # Truncate very long pages to avoid context overrun
            if len(content) > 8000:
                content = content[:8000] + "\n[truncated]"
            sections.append(f"## {title}\nURL: {r['url']}\n\n{content}")

        user_content = "\n\n---\n\n".join(sections)

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_json = message.content[0].text.strip()

        # Strip accidental markdown fences if Claude added them
        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
            raw_json = raw_json.strip()

        parsed = json.loads(raw_json)

        if "competitor_profiles" not in parsed:
            raise ValueError("Claude response missing key: competitor_profiles")

        competitor_profiles = parsed["competitor_profiles"]
        required_fields = {"url", "key_messaging", "target_audience", "content_themes", "primary_cta"}
        for profile in competitor_profiles:
            missing = required_fields - set(profile.keys())
            if missing:
                raise ValueError(f"competitor_profiles entry missing keys: {missing}")

        logger.info(
            "extract_node: agent_run_id=%s competitors=%d",
            agent_run_id, len(competitor_profiles),
        )
        return {"competitor_profiles": competitor_profiles}

    except json.JSONDecodeError as exc:
        error_msg = f"extract_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"extract_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
