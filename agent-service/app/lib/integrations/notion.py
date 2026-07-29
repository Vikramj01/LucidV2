"""
Notion page content extraction for Brand Voice Vault ingestion.

Recursively walks a page's block children and flattens each block's
rich_text into plain text. Notion has ~20 block types; this handles the
common ones generically by reading `block[block["type"]]["rich_text"]`
where present, which covers paragraphs, headings, lists, quotes, callouts,
and toggles — the vast majority of real-world page content.
"""
from __future__ import annotations

import httpx

from app.lib.integrations.token import get_integration_token

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
PAGE_SIZE = 100
MAX_DEPTH = 5


def extract_notion_text(integration_id: str, external_file_id: str) -> str:
    """external_file_id is the Notion page id — its top-level block id."""
    token = get_integration_token(integration_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
    }

    lines = _walk_block_children(external_file_id, headers, depth=0)
    return "\n\n".join(line for line in lines if line).strip()


def _walk_block_children(block_id: str, headers: dict, depth: int) -> list[str]:
    if depth > MAX_DEPTH:
        return []

    lines: list[str] = []
    start_cursor: str | None = None

    while True:
        params = {"page_size": PAGE_SIZE}
        if start_cursor:
            params["start_cursor"] = start_cursor

        resp = httpx.get(
            f"{NOTION_API_BASE}/blocks/{block_id}/children",
            params=params,
            headers=headers,
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()

        for block in data.get("results", []):
            text = _extract_block_text(block)
            if text:
                lines.append(text)
            if block.get("has_children"):
                lines.extend(_walk_block_children(block["id"], headers, depth + 1))

        if not data.get("has_more"):
            break
        start_cursor = data.get("next_cursor")

    return lines


def _extract_block_text(block: dict) -> str:
    block_type = block.get("type", "")
    content = block.get(block_type, {})
    rich_text = content.get("rich_text", [])
    if not rich_text:
        return ""
    return "".join(segment.get("plain_text", "") for segment in rich_text)
