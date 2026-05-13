from contextlib import asynccontextmanager
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Any

from app.lib.settings import settings  # noqa: F401 — ensures env vars are validated on startup


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Lucid Agent Service", lifespan=lifespan)


class JobRequest(BaseModel):
    job_id: str
    job_type: str
    workspace_id: str
    org_id: str
    payload: dict[str, Any] = {}
    created_at: str = ""
    priority: int = 1


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/run/intel", status_code=202)
async def run_intel(job: JobRequest, background_tasks: BackgroundTasks):
    from app.graphs.intel_agent import run_intel_agent
    background_tasks.add_task(run_intel_agent, job.model_dump())
    return {"status": "accepted", "job_id": job.job_id}


@app.post("/run/architect", status_code=202)
async def run_architect(job: JobRequest, background_tasks: BackgroundTasks):
    from app.graphs.architect_agent import run_architect_agent
    background_tasks.add_task(run_architect_agent, job.model_dump())
    return {"status": "accepted", "job_id": job.job_id}


@app.post("/run/vault", status_code=202)
async def run_vault(job: JobRequest, background_tasks: BackgroundTasks):
    from app.graphs.vault_ingest import run_vault_ingest
    background_tasks.add_task(run_vault_ingest, job.model_dump())
    return {"status": "accepted", "job_id": job.job_id}
