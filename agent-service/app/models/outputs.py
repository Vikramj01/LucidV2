"""
Validated shapes for agent outputs, before they are written to Supabase.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class CompetitorProfile(BaseModel):
    url: str
    name: str
    positioning: str = ""
    key_messaging: list[str]
    target_audience: str
    content_themes: list[str]
    primary_cta: str
    weaknesses: list[str] = Field(default_factory=list)
    research_notes: list[str] = Field(default_factory=list)


class ResearchFinding(BaseModel):
    question: str
    answer: str
    sources: list[str] = Field(default_factory=list)


class ResearchSignal(BaseModel):
    """PRD §4.4 Research Signal, plus research questions and their findings."""
    competitors_analysed: list[str]
    competitor_profiles: list[CompetitorProfile]
    market_gaps: list[str]
    intent_triggers: list[str]
    recommended_angles: list[str]
    research_questions: list[str] = Field(default_factory=list)
    research_findings: list[ResearchFinding] = Field(default_factory=list)
    sources: list[str]
