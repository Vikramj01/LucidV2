"""
estimate_node: send the research signal + any scraped market-data sources
to Claude Sonnet and produce a structured Market Sizing Report JSON.

Output shape matches the market_sizing_reports table:
  tam_estimate, sam_estimate, som_estimate: { value, currency, methodology, assumptions[] }
  methodology_notes: str
  sources: list[str]
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import anthropic

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.market_sizing_agent import MarketSizingState

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096

SYSTEM_PROMPT = """\
You are Vimi, an expert B2B market analyst at ViMi Digital. You estimate market size \
(TAM/SAM/SOM) for B2B brands, grounded in competitive research and any supplied \
market-data sources.

You will be given:
1. A research signal (competitor intelligence, market gaps, recommended angles)
2. Any additional scraped market-data sources (may be empty)

Return ONLY a valid JSON object — no markdown fences, no explanation — matching this schema:

{
  "tam_estimate": {
    "value": "<e.g. '$4.2B'>",
    "currency": "USD",
    "methodology": "<how this was derived, one sentence>",
    "assumptions": ["<assumption>", ...]
  },
  "sam_estimate": { "value": "...", "currency": "USD", "methodology": "...", "assumptions": ["..."] },
  "som_estimate": { "value": "...", "currency": "USD", "methodology": "...", "assumptions": ["..."] },
  "methodology_notes": "<2-4 sentences on the overall approach and confidence level>",
  "sources": ["<source reference>", ...]
}

Rules:
- Every numeric estimate MUST have an explicit methodology and stated assumptions —
  never assert a number without justifying it
- If market-data sources were provided, ground your estimates in them and cite them
  in `sources`; if none were provided, say so in methodology_notes and rely on the
  research signal plus general market knowledge, flagging lower confidence
- SAM must be a subset of TAM; SOM must be a subset of SAM — the methodology should
  make the narrowing logic explicit (e.g. geography, segment, realistic capture rate)
- Return only JSON, nothing else
"""


def estimate_node(state: "MarketSizingState") -> dict:
    research_signal: dict = state["research_signal"]
    scraped_sources: list[dict] = state.get("scraped_sources") or []
    agent_run_id: str = state["agent_run_id"]

    try:
        sources_block = "\n\n".join(
            f"[Source: {s['url']}]\n{(s.get('markdown') or '')[:4000]}"
            for s in scraped_sources
        ) or "No additional market-data sources supplied."

        user_content = f"""## Research Signal
{json.dumps(research_signal, indent=2)}

## Market Data Sources
{sources_block}
"""

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

        sizing_data = json.loads(raw_json)

        required = {"tam_estimate", "sam_estimate", "som_estimate", "methodology_notes", "sources"}
        missing = required - set(sizing_data.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")

        logger.info(
            "estimate_node: agent_run_id=%s tam=%s",
            agent_run_id, sizing_data["tam_estimate"].get("value"),
        )
        return {"sizing_data": sizing_data}

    except json.JSONDecodeError as exc:
        error_msg = f"estimate_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"estimate_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
