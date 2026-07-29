"""
get_integration_token: fetch a live, refreshed OAuth access token for a
workspace integration from the backend's internal endpoint.

Agent-service never holds Google/Notion OAuth client secrets — backend
owns the OAuth handshake and token refresh, since keeping client secrets
in exactly one service is simpler to reason about than duplicating them.
This call is authenticated with a shared internal API key, not a user JWT.
"""
from __future__ import annotations

import httpx

from app.lib.settings import settings


class IntegrationTokenError(Exception):
    pass


def get_integration_token(integration_id: str) -> str:
    if not settings.backend_internal_url or not settings.internal_api_key:
        raise IntegrationTokenError(
            "backend_internal_url / internal_api_key not configured — "
            "cannot fetch integration token"
        )

    url = f"{settings.backend_internal_url.rstrip('/')}/api/internal/integrations/{integration_id}/token"
    response = httpx.get(
        url,
        headers={"X-Internal-Api-Key": settings.internal_api_key},
        timeout=15.0,
    )
    if response.status_code != 200:
        raise IntegrationTokenError(
            f"Failed to fetch token for integration {integration_id}: "
            f"{response.status_code} {response.text[:500]}"
        )

    data = response.json()
    token = data.get("access_token")
    if not token:
        raise IntegrationTokenError(f"No access_token in response for integration {integration_id}")

    return token
