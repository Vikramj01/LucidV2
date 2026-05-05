from fastapi import FastAPI
from app.lib.settings import settings
from app.lib.worker import start_worker
import asyncio
import contextlib

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    worker_task = asyncio.create_task(start_worker())
    yield
    worker_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await worker_task

app = FastAPI(title="Lucid Agent Service", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok"}
