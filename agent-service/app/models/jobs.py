from pydantic import BaseModel, Field
from typing import Any, Literal
import uuid
from datetime import datetime, timezone

JobType = Literal["research_run", "icp_run", "market_sizing_run", "architect_run", "vault_ingest"]


class RedisJob(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_type: JobType
    workspace_id: str
    org_id: str
    payload: dict[str, Any] = {}
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    priority: int = 1


class VaultIngestPayload(BaseModel):
    document_id: str
    source_type: Literal["pdf", "url", "free_text"]
    file_path: str | None = None
    url: str | None = None
    text: str | None = None


class ResearchRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    competitor_urls: list[str] = Field(min_length=1, max_length=5)
    industry_keywords: str = ""
    research_questions: list[str] = Field(default_factory=list, max_length=5)


class IcpRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    research_signal_id: str | None = None


class MarketSizingRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    research_signal_id: str | None = None
    market_data_urls: list[str] = Field(default_factory=list, max_length=5)


class ArchitectRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    campaign_id: str
    research_signal_id: str | None = None
    campaign_goal: Literal["awareness", "leads", "pipeline", "retention"]
    channels: list[Literal["linkedin", "google_search", "google_display", "meta", "email"]]


PAYLOAD_MODELS: dict[str, type[BaseModel]] = {
    "research_run": ResearchRunPayload,
    "icp_run": IcpRunPayload,
    "market_sizing_run": MarketSizingRunPayload,
    "architect_run": ArchitectRunPayload,
    "vault_ingest": VaultIngestPayload,
}
