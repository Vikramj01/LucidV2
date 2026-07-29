"""
scrape_node: fetch raw content from any user-supplied market-data URLs
(e.g. analyst reports, industry association pages) via Firecrawl.

The graph routes around this node entirely when no market_data_urls were
supplied — see market_sizing_agent.py's conditional edge.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from firecrawl import FirecrawlApp

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.market_sizing_agent import MarketSizingState

logger = logging.getLogger(__name__)

SCRAPE_FORMATS = ["markdown"]
SCRAPE_TIMEOUT_MS = 30_000


def scrape_node(state: "MarketSizingState") -> dict:
    market_data_urls: list[str] = state.get("market_data_urls") or []
    agent_run_id = state["agent_run_id"]

    if not market_data_urls:
        return {"scraped_sources": []}

    try:
        client = FirecrawlApp(api_key=settings.firecrawl_api_key)
        results: list[dict] = []

        for url in market_data_urls:
            try:
                response = client.scrape_url(
                    url,
                    formats=SCRAPE_FORMATS,
                    timeout=SCRAPE_TIMEOUT_MS,
                )
                markdown = getattr(response, "markdown", "") or ""
                metadata = getattr(response, "metadata", {}) or {}
                results.append({
                    "url": url,
                    "markdown": markdown,
                    "title": metadata.get("title", ""),
                })
                logger.info("scrape_node: scraped url=%s chars=%d", url, len(markdown))
            except Exception as exc:
                logger.warning("scrape_node: failed url=%s error=%s", url, exc)

        logger.info(
            "scrape_node: agent_run_id=%s scraped=%d/%d",
            agent_run_id, len(results), len(market_data_urls),
        )
        return {"scraped_sources": results}

    except Exception as exc:
        error_msg = f"scrape_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
