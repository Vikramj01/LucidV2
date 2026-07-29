from pydantic import BaseModel, Field
from typing import Any
import uuid
from datetime import datetime, timezone

class RedisJob(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    job_type: str
    workspace_id: str
    org_id: str
    payload: dict[str, Any] = {}
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    priority: int = 1

class VaultIngestPayload(BaseModel):
    document_id: str
    source_type: str  # 'pdf' | 'url' | 'free_text' | 'google_drive' | 'notion'
    file_path: str | None = None
    url: str | None = None
    text: str | None = None
    integration_id: str | None = None
    external_file_id: str | None = None

class ResearchRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    competitor_urls: list[str]
    industry_keywords: str
    research_questions: list[str] = []

class IcpRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    research_signal_id: str | None = None

class MarketSizingRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    research_signal_id: str | None = None
    market_data_urls: list[str] = []

class ArchitectRunPayload(BaseModel):
    agent_run_id: str
    project_id: str
    campaign_id: str
    research_signal_id: str | None = None
    icp_profile_id: str | None = None
    market_sizing_report_id: str | None = None
    campaign_goal: str
    channels: list[str]
