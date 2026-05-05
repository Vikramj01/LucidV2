import asyncio
import json
import logging
from app.lib.redis import get_redis

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
            job = json.loads(raw)
            await dispatch(job)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Worker error: %s", exc)
            await asyncio.sleep(1)

async def dispatch(job: dict) -> None:
    job_type = job.get("job_type")
    logger.info("Dispatching job %s (type=%s)", job.get("job_id"), job_type)

    if job_type == "vault_ingest":
        from app.graphs.vault_ingest import run_vault_ingest
        await run_vault_ingest(job)
    elif job_type == "intel_run":
        from app.graphs.intel_agent import run_intel_agent
        await run_intel_agent(job)
    elif job_type == "architect_run":
        from app.graphs.architect_agent import run_architect_agent
        await run_architect_agent(job)
    else:
        logger.warning("Unknown job_type: %s", job_type)
