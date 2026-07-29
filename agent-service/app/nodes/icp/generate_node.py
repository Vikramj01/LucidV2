"""
generate_node: send the research signal + vault context to Claude Sonnet
and produce a structured ICP Profile JSON.

Output shape matches the icp_profiles table:
  firmographics:    { company_size, industry[], revenue_range, geography[] }
  personas:         [{ title, department, seniority, pain_points[], buying_triggers[], decision_role }]
  pain_points:      list[str]
  buying_triggers:  list[str]
  sources:          list[str]
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import anthropic

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.icp_agent import IcpState

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 4096

SYSTEM_PROMPT = """\
You are Vimi, an expert B2B marketing strategist at ViMi Digital. You build precise \
Ideal Customer Profiles (ICPs) for B2B brands, grounded in market research and brand \
voice context.

You will be given:
1. A research signal (competitor intelligence, market gaps, intent triggers, recommended angles)
2. Brand voice context from the client's Brand Voice Vault

Return ONLY a valid JSON object — no markdown fences, no explanation — matching this schema:

{
  "firmographics": {
    "company_size": "<e.g. '50-500 employees'>",
    "industry": ["<industry>", ...],
    "revenue_range": "<e.g. '$5M-$50M ARR'>",
    "geography": ["<region>", ...]
  },
  "personas": [
    {
      "title": "<job title>",
      "department": "<department>",
      "seniority": "<e.g. 'Director', 'VP', 'C-suite'>",
      "pain_points": ["<pain point>", ...],
      "buying_triggers": ["<trigger>", ...],
      "decision_role": "<e.g. 'economic buyer', 'champion', 'influencer'>"
    }
  ],
  "pain_points": ["<pain point>", ...],
  "buying_triggers": ["<trigger>", ...],
  "sources": ["<source reference>", ...]
}

Rules:
- personas: 2-4 distinct buyer personas grounded in the research signal's intent triggers
- pain_points and buying_triggers at the top level: the union across all personas, 3-6 items each
- sources: cite the research signal and any brand voice vault chunks actually used
- Tone must match the brand voice extracted from vault context
- Return only JSON, nothing else
"""


def generate_node(state: "IcpState") -> dict:
    research_signal: dict = state["research_signal"]
    vault_chunks: list[dict] = state["vault_chunks"]
    agent_run_id: str = state["agent_run_id"]

    try:
        vault_context = "\n\n".join(
            f"[Brand Voice Chunk {i+1}]\n{c['content']}"
            for i, c in enumerate(vault_chunks)
        ) or "No brand voice vault content available."

        user_content = f"""## Research Signal
{json.dumps(research_signal, indent=2)}

## Brand Voice Vault Context
{vault_context}
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

        icp_data = json.loads(raw_json)

        required = {"firmographics", "personas", "pain_points", "buying_triggers", "sources"}
        missing = required - set(icp_data.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")

        logger.info(
            "generate_node: agent_run_id=%s personas=%d",
            agent_run_id, len(icp_data.get("personas", [])),
        )
        return {"icp_data": icp_data}

    except json.JSONDecodeError as exc:
        error_msg = f"generate_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"generate_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
