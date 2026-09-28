import asyncio
import json
import logging
from pydantic import ValidationError

from app.lib.redis import get_redis
from app.models.jobs import PAYLOAD_MODELS, RedisJob

logger = logging.getLogger(__name__)

QUEUE_KEY = "lucid:jobs"
POLL_INTERVAL = 2  # seconds


async def start_worker() -> None:
    redis = get_redis()
    logger.info("Worker started — polling %s", QUEUE_KEY)

    while True:
        try:
            result = redis.blpop(QUEUE_KEY, timeout=POLL_INTERVAL)
            if result is None:
                await asyncio.sleep(0)
                continue

            _, raw = result
            try:
                job = json.loads(raw)
            except json.JSONDecodeError as exc:
                logger.error("Failed to parse job JSON: %s | raw=%r", exc, raw)
                continue

            await dispatch(job)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Worker loop error: %s", exc)
            await asyncio.sleep(1)


def validate_job(job: dict) -> dict:
    """
    Validate the job envelope and its job_type's payload.

    Returns the job with its payload normalised (defaults filled in).
    Raises pydantic.ValidationError on a malformed job.
    """
    envelope = RedisJob.model_validate(job)
    payload = PAYLOAD_MODELS[envelope.job_type].model_validate(envelope.payload)
    return {**envelope.model_dump(), "payload": payload.model_dump()}


async def dispatch(job: dict) -> None:
    job_type = job.get("job_type")
    job_id = job.get("job_id", "unknown")
    logger.info("Dispatching job %s (type=%s)", job_id, job_type)

    try:
        job = validate_job(job)
    except ValidationError as exc:
        logger.error("Job %s rejected — invalid job: %s", job_id, exc)
        _try_mark_failure(job, f"Invalid job: {exc}")
        return

    try:
        if job_type == "vault_ingest":
            from app.graphs.vault_ingest import run_vault_ingest
            await run_vault_ingest(job)
        elif job_type == "research_run":
            from app.graphs.research_agent import run_research_agent
            await run_research_agent(job)
        elif job_type == "architect_run":
            from app.graphs.architect_agent import run_architect_agent
            await run_architect_agent(job)
        else:
            # icp_run and market_sizing_run land in Sprint 11
            logger.warning("No handler yet for job_type: %s", job_type)
            _try_mark_failure(job, f"Job type {job_type} is not supported yet")
    except Exception as exc:
        logger.exception("Job %s failed during dispatch: %s", job_id, exc)
        # Best-effort failure marking — individual graphs handle their own failures,
        # but this catches unexpected crashes at the dispatch level.
        _try_mark_failure(job, str(exc))


def _try_mark_failure(job: dict, error: str) -> None:
    """Last-resort failure marker — only fires if the graph itself crashed without handling."""
    try:
        payload = job.get("payload", {})
        agent_run_id = payload.get("agent_run_id")
        document_id = payload.get("document_id")

        if agent_run_id:
            from app.lib.agent_run import mark_failed
            mark_failed(agent_run_id, f"Unhandled dispatch error: {error}")

        if document_id:
            from app.lib.supabase import get_supabase
            get_supabase().table("vault_documents").update({
                "status": "failed",
                "error_message": f"Unhandled dispatch error: {error}"[:2000],
            }).eq("id", document_id).execute()
    except Exception:
        pass  # never let failure marking crash the worker
