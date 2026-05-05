"""Intel Agent graph — implemented in Sprint 4."""
import logging

logger = logging.getLogger(__name__)


async def run_intel_agent(job: dict) -> None:
    logger.warning("Intel Agent not yet implemented (Sprint 4). job_id=%s", job.get("job_id"))
    # Mark agent_run as failed so Mission Control shows correct state
    payload = job.get("payload", {})
    agent_run_id = payload.get("agent_run_id")
    if agent_run_id:
        from app.lib.agent_run import mark_failed
        mark_failed(agent_run_id, "Intel Agent not yet implemented")
