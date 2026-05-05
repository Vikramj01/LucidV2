"""Architect Agent graph — implemented in Sprint 5."""
import logging

logger = logging.getLogger(__name__)


async def run_architect_agent(job: dict) -> None:
    logger.warning("Architect Agent not yet implemented (Sprint 5). job_id=%s", job.get("job_id"))
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id")
    if agent_run_id:
        from app.lib.agent_run import mark_failed
        mark_failed(agent_run_id, "Architect Agent not yet implemented")
