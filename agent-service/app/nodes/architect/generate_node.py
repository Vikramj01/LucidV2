"""
generate_node: send project intelligence (research signal + optional ICP +
optional market sizing) + vault context to Claude Sonnet and produce a
structured Campaign Playbook JSON.

Output shape matches the campaign_playbooks table:
  winning_angle:   str
  target_persona:  str
  playbook_content: {
    executive_summary: str,
    messaging_framework: { primary_message, proof_points[], cta },
    channel_plans: [{ channel, objective, content_themes[], kpis[] }],
    differentiation: str,
    risk_flags: []
  }

ICP and market sizing are optional inputs — a Project may not have run
those agents yet. When absent, the prompt tells Claude explicitly so it
can flag the gap in risk_flags rather than fabricating personas or
market-size numbers it wasn't given.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import anthropic

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.architect_agent import ArchitectState

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_TOKENS = 6000

SYSTEM_PROMPT = """\
You are Vimi, an expert B2B marketing strategist at ViMi Digital. You create \
precise, actionable campaign playbooks for B2B brands.

You will be given:
1. A research signal (competitor intelligence, market gaps, recommended angles)
2. An ICP profile (firmographics, buyer personas), if one has been generated for this project
3. A market sizing report (TAM/SAM/SOM), if one has been generated for this project
4. Brand voice context from the client's Brand Voice Vault
5. Campaign parameters (goal, channels)

Return ONLY a valid JSON object — no markdown fences, no explanation — matching this schema:

{
  "winning_angle": "<the single strongest differentiating angle, one sentence>",
  "target_persona": "<ideal buyer persona description, two sentences max>",
  "playbook_content": {
    "executive_summary": "<3-5 sentence summary of the campaign strategy>",
    "messaging_framework": {
      "primary_message": "<the core message, one sentence>",
      "proof_points": ["<proof point>", ...],
      "cta": "<primary call to action>"
    },
    "channel_plans": [
      {
        "channel": "<channel name>",
        "objective": "<specific channel objective>",
        "content_themes": ["<theme>", ...],
        "kpis": ["<kpi>", ...]
      }
    ],
    "differentiation": "<why this brand wins vs competitors, two sentences>",
    "risk_flags": ["<risk or assumption to watch>", ...]
  }
}

Rules:
- winning_angle must come from the recommended_angles in the research signal
- target_persona should draw on the ICP profile's personas when one is provided;
  if no ICP profile was provided, derive a reasonable persona from the research
  signal and brand voice context, and add a risk_flag noting no ICP has been
  generated for this project yet
- if no market sizing report was provided, do not invent TAM/SAM/SOM figures;
  add a risk_flag noting market sizing hasn't been run for this project yet
- channel_plans must include one entry per channel provided in campaign parameters
- proof_points: 3-5 items grounded in the brand voice vault context
- kpis: 2-3 measurable metrics per channel
- risk_flags: 1-3 items; omit if none
- Tone must match the brand voice extracted from vault context
- Return only JSON, nothing else
"""


def generate_node(state: "ArchitectState") -> dict:
    research_signal: dict = state["research_signal"]
    icp_profile: dict | None = state.get("icp_profile")
    market_sizing_report: dict | None = state.get("market_sizing_report")
    vault_chunks: list[dict] = state["vault_chunks"]
    campaign_goal: str = state["campaign_goal"]
    channels: list[str] = state["channels"]
    agent_run_id: str = state["agent_run_id"]

    try:
        # Build vault context block
        vault_context = "\n\n".join(
            f"[Brand Voice Chunk {i+1}]\n{c['content']}"
            for i, c in enumerate(vault_chunks)
        ) or "No brand voice vault content available."

        icp_block = json.dumps(icp_profile, indent=2) if icp_profile else "Not available — no ICP profile has been generated for this project yet."
        market_sizing_block = json.dumps(market_sizing_report, indent=2) if market_sizing_report else "Not available — no market sizing report has been generated for this project yet."

        user_content = f"""## Campaign Parameters
Goal: {campaign_goal}
Channels: {', '.join(channels)}

## Research Signal
{json.dumps(research_signal, indent=2)}

## ICP Profile
{icp_block}

## Market Sizing Report
{market_sizing_block}

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

        # Strip accidental markdown fences
        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
            raw_json = raw_json.strip()

        playbook_data = json.loads(raw_json)

        required = {"winning_angle", "target_persona", "playbook_content"}
        missing = required - set(playbook_data.keys())
        if missing:
            raise ValueError(f"Claude response missing keys: {missing}")

        content_required = {"executive_summary", "messaging_framework", "channel_plans"}
        content_missing = content_required - set(playbook_data["playbook_content"].keys())
        if content_missing:
            raise ValueError(f"playbook_content missing keys: {content_missing}")

        logger.info(
            "generate_node: agent_run_id=%s channels=%d",
            agent_run_id, len(playbook_data["playbook_content"].get("channel_plans", [])),
        )
        return {"playbook_data": playbook_data}

    except json.JSONDecodeError as exc:
        error_msg = f"generate_node: Claude returned invalid JSON — {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}

    except Exception as exc:
        error_msg = f"generate_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
