"""
scrape_node: fetch raw content from each competitor URL via Firecrawl.

Returns a list of ScrapeResult dicts (url, markdown, title, description).
On partial failure (some URLs succeed, some fail) we continue with the
successful results and log warnings — a total failure aborts the graph.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from firecrawl import FirecrawlApp

from app.lib.settings import settings

if TYPE_CHECKING:
    from app.graphs.intel_agent import IntelState

logger = logging.getLogger(__name__)

# Firecrawl scrape options
SCRAPE_FORMATS = ["markdown"]
SCRAPE_TIMEOUT_MS = 30_000


def scrape_node(state: "IntelState") -> dict:
    competitor_urls: list[str] = state["competitor_urls"]
    agent_run_id = state["agent_run_id"]

    try:
        client = FirecrawlApp(api_key=settings.firecrawl_api_key)
        results: list[dict] = []
        failed: list[str] = []

        for url in competitor_urls:
            try:
                response = client.scrape_url(
                    url,
                    formats=SCRAPE_FORMATS,
                    timeout=SCRAPE_TIMEOUT_MS,
                )
                # FirecrawlApp.scrape_url returns a ScrapeResponse object
                markdown = getattr(response, "markdown", "") or ""
                metadata = getattr(response, "metadata", {}) or {}
                results.append({
                    "url": url,
                    "markdown": markdown,
                    "title": metadata.get("title", ""),
                    "description": metadata.get("description", ""),
                })
                logger.info("scrape_node: scraped url=%s chars=%d", url, len(markdown))
            except Exception as exc:
                logger.warning("scrape_node: failed url=%s error=%s", url, exc)
                failed.append(url)

        if not results:
            error_msg = f"scrape_node: all {len(competitor_urls)} URLs failed to scrape"
            logger.error(error_msg)
            return {"error": error_msg}

        if failed:
            logger.warning(
                "scrape_node: %d/%d URLs failed, continuing with %d",
                len(failed), len(competitor_urls), len(results),
            )

        logger.info(
            "scrape_node: agent_run_id=%s scraped=%d/%d",
            agent_run_id, len(results), len(competitor_urls),
        )
        return {"scrape_results": results}

    except Exception as exc:
        error_msg = f"scrape_node failed: {exc}"
        logger.exception(error_msg)
        return {"error": error_msg}
