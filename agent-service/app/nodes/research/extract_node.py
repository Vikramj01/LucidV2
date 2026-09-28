"""
extract_node: one Claude Sonnet call per scraped competitor, in parallel, producing
a structured competitor profile. Open-ended research questions are passed in so
each profile also captures evidence relevant to them.

A competitor whose extraction fails is dropped with a warning; if every
extraction fails the graph aborts.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from app.lib.llm import complete_json

if TYPE_CHECKING:
    from app.graphs.research_agent import ResearchState

logger = logging.getLogger(__name__)

MAX_TOKENS = 2048
MAX_PAGE_CHARS = 12_000

SYSTEM_PROMPT = """\
You are a B2B market intelligence analyst. You will be given scraped content from \
ONE competitor website. Analyse it and return ONLY a valid JSON object — no \
markdown fences, no explanation.

The JSON must match this exact schema:
{
  "name": "<company name>",
  "positioning": "<one sentence>",
  "key_messaging": ["<message>", ...],
  "target_audience": "<who they sell to, one sentence>",
  "content_themes": ["<theme>", ...],
  "primary_cta": "<their main call to action>",
  "weaknesses": ["<weakness>", ...],
  "research_notes": ["<evidence relevant to a research question>", ...]
}

Rules:
- Base everything only on the provided content; do not invent facts
- key_messaging: 3–5 items; content_themes: 3–5 items; weaknesses: 1–4 items
- research_notes: evidence from this page that bears on the research questions, \
if any were given; otherwise an empty list
- All strings must be concise (under 150 characters)
- Return only JSON, nothing else
"""

REQUIRED_KEYS = {"name", "key_messaging", "target_audience", "content_themes", "primary_cta"}


def _user_content(page: dict, industry_keywords: str, research_questions: list[str]) -> str:
    content = (page.get("markdown") or "").strip()
    if len(content) > MAX_PAGE_CHARS:
        content = content[:MAX_PAGE_CHARS] + "\n[truncated]"
    parts = [f"Industry keywords: {industry_keywords or '(none given)'}"]
    if research_questions:
        parts.append("Research questions:\n" + "\n".join(f"- {q}" for q in research_questions))
    parts.append(f"## {page.get('title') or page['url']}\nURL: {page['url']}\n\n{content}")
    return "\n\n".join(parts)


def extract_profile(page: dict, industry_keywords: str, research_questions: list[str]) -> dict:
    """Extract one competitor profile; raises on failure."""
    profile = complete_json(
        SYSTEM_PROMPT,
        _user_content(page, industry_keywords, research_questions),
        MAX_TOKENS,
    )
    missing = REQUIRED_KEYS - set(profile.keys())
    if missing:
        raise ValueError(f"Claude response missing keys: {missing}")
    profile["url"] = page["url"]
    profile.setdefault("research_notes", [])
    return profile


async def extract_node(state: "ResearchState") -> dict:
    scrape_results: list[dict] = state["scrape_results"]
    industry_keywords: str = state["industry_keywords"]
    research_questions: list[str] = state["research_questions"]
    agent_run_id = state["agent_run_id"]

    try:
        outcomes = await asyncio.gather(
            *(
                asyncio.to_thread(extract_profile, page, industry_keywords, research_questions)
                for page in scrape_results
            ),
            return_exceptions=True,
        )

        profiles: list[dict] = []
        for page, outcome in zip(scrape_results, outcomes):
            if isinstance(outcome, BaseException):
                logger.warning("extract_node: failed url=%s error=%s", page["url"], outcome)
            else:
                profiles.append(outcome)

        if not profiles:
            error_msg = f"extract_node: extraction failed for all {len(scrape_results)} competitors"
            logger.error(error_msg)
            return {"error": error_msg}

        logger.info(
            "extract_node: agent_run_id=%s profiles=%d/%d",
            agent_run_id, len(profiles), len(scrape_results),
        )
        return {"competitor_profiles": profiles}

    except Exception as exc:
        error_msg = f"extract_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
