from __future__ import annotations

from datetime import datetime
from uuid import UUID

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain import EventSource, MemoryCategory


class UserRegister(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str
    role: str


class TokenRead(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class TimelineEventCreate(BaseModel):
    category: MemoryCategory
    source: EventSource = EventSource.MANUAL
    title: str = Field(min_length=1, max_length=120)
    details: str = Field(min_length=1, max_length=4000)
    occurred_at: datetime
    linked_entities: list[str] = Field(default_factory=list)


class TimelineEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: MemoryCategory
    source: EventSource
    title: str
    details: str
    occurred_at: datetime
    linked_entities: tuple[str, ...]
    created_at: datetime
    archived_at: datetime | None


class DoctorSummarySection(BaseModel):
    category: MemoryCategory
    events: list[TimelineEventRead]


class DoctorSummaryRead(BaseModel):
    generated_at: datetime
    event_count: int
    disclaimer: str
    sections: list[DoctorSummarySection]


class VoiceJournalAnalyze(BaseModel):
    transcript: str = Field(min_length=1, max_length=4000)


class VoiceTranscriptionRead(BaseModel):
    transcript: str
    provider: str
    model: str


class PrescriptionAnalyze(BaseModel):
    image_name: str = Field(min_length=1, max_length=240)
    image_data: str = Field(min_length=1, max_length=5_000_000)
    question: str = Field(min_length=1, max_length=1200)


class AiAnalysisRead(BaseModel):
    title: str
    summary: str
    extracted_entities: list[str]
    safety_note: str
    created_event: TimelineEventRead


class HealthRecordCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    details: str = Field(min_length=1, max_length=4000)
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None


class HealthRecordRead(BaseModel):
    id: str
    record_type: str
    title: str
    details: str
    metadata: dict[str, Any]
    occurred_at: datetime
    created_at: datetime
    archived_at: datetime | None
