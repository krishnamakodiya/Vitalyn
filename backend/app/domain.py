from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID, uuid4


class MemoryCategory(StrEnum):
    PERMANENT = "permanent"
    LONG_TERM = "long_term"
    MEDICAL = "medical"
    CONVERSATION = "conversation"


class EventSource(StrEnum):
    MANUAL = "manual"
    VOICE_JOURNAL = "voice_journal"
    PRESCRIPTION_OCR = "prescription_ocr"
    REPORT_UPLOAD = "report_upload"
    WEARABLE = "wearable"
    DOCTOR_VISIT = "doctor_visit"


@dataclass(frozen=True)
class TimelineEvent:
    category: MemoryCategory
    source: EventSource
    title: str
    details: str
    occurred_at: datetime
    linked_entities: tuple[str, ...] = field(default_factory=tuple)
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    archived_at: datetime | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise ValueError("title is required")
        if not self.details.strip():
            raise ValueError("details are required")
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurred_at must include timezone information")


@dataclass(frozen=True)
class DoctorSummary:
    generated_at: datetime
    event_count: int
    sections: dict[MemoryCategory, tuple[TimelineEvent, ...]]
    disclaimer: str
