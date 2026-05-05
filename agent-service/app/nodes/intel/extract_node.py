"""
extract_node: send scraped competitor content to Claude Sonnet and extract
a structured MarketSignal JSON.

Output shape matches the market_signals table:
  competitor_profiles: list[CompetitorProfile]
  market_gaps:         list[str]
  intent_triggers:     list[str]
  recommended_angles:  list[str]
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import anthropic

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.intel_agent import IntelState

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096

SYSTEM_PROMPT = """\
You are a B2B market intelligence analyst. You will be given scraped content from \
competitor websites. Analyse the content and return ONLY a valid JSON object — no \
markdown fences, no explanation.

The JSON must match this exact schema:
{
  "competitor_profiles": [
    {
      "name": "<company name>",
      "url": "<url>",
      "positioning": "<one sentence>",
      "key_messages": ["<message>", ...],
      "icp": "<ideal customer profile, one sentence>",
      "weaknesses": ["<weakness>", ...]
    }
  ],
  "market_gaps": ["<gap>", ...],
  "intent_triggers": ["<trigger>", ...],
  "recommended_angles": ["<angle>", ...]
}

Rules:
- competitor_profiles: one entry per competitor, based only on the provided content
- market_gaps: 3–6 unmet needs or underserved segments visible from the competitive landscape
- intent_triggers: 3–6 buying signals or pain points that indicate purchase intent
- recommended_angles: 3–5 differentiated positioning angles the client could own
- All strings must be concise (under 150 characters)
- Return only JSON, nothing else
"""


def extract_node(state: "IntelState") -> dict:
    scrape_results: list[dict] = state["scrape_results"]
    industry_keywords: str = state["industry_keywords"]
    agent_run_id = state["agent_run_id"]

    try:
        # Build the user message — concatenate all scraped pages
        sections: list[str] = [
            f"Industry keywords: {industry_keywords}\n",
        ]
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

        signal_data = json.loads(raw_json)

        # Validate required keys exist
        required = {"competitor_profiles", "market_gaps", "intent_triggers", "recommended_angles"}
        missing = required - set(signal_data.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")

        logger.info(
            "extract_node: agent_run_id=%s competitors=%d gaps=%d",
            agent_run_id,
            len(signal_data["competitor_profiles"]),
            len(signal_data["market_gaps"]),
        )
        return {"signal_data": signal_data}

    except json.JSONDecodeError as exc:
        error_msg = f"extract_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"extract_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
