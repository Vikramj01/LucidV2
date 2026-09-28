"""
Shared Claude helper for agent nodes that expect a JSON object back.
"""
from __future__ import annotations

import json

import anthropic

from app.lib.settings import settings

MODEL = "claude-sonnet-4-20250514"


def parse_json_response(raw: str) -> dict:
    """Parse a JSON object from a Claude response, tolerating markdown fences."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object")
    return data


def complete_json(system: str, user_content: str, max_tokens: int = 4096) -> dict:
    """Send one message to Claude and return the parsed JSON object it replies with."""
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )
    return parse_json_response(message.content[0].text)
