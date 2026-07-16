from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.domain import DoctorSummary, EventSource, MemoryCategory, TimelineEvent
from app.repository import HealthMemoryRepository
from app.safety import MEDICAL_DISCLAIMER


class HealthMemoryService:
    def __init__(self, repository: HealthMemoryRepository) -> None:
        self._repository = repository

    def create_event(
        self,
        user_id: str,
        category: MemoryCategory,
        source: EventSource,
        title: str,
        details: str,
        occurred_at: datetime,
        linked_entities: tuple[str, ...] = (),
    ) -> TimelineEvent:
        event = TimelineEvent(
            category=category,
            source=source,
            title=title.strip(),
            details=details.strip(),
            occurred_at=occurred_at,
            linked_entities=tuple(entity.strip() for entity in linked_entities if entity.strip()),
        )
        return self._repository.add_event(user_id, event)

    def list_events(
        self,
        user_id: str,
        category: MemoryCategory | None = None,
        include_archived: bool = False,
    ) -> tuple[TimelineEvent, ...]:
        return self._repository.list_events(user_id, category, include_archived)

    def build_doctor_summary(self, user_id: str) -> DoctorSummary:
        events = self._repository.list_events(user_id)
        sections: dict[MemoryCategory, list[TimelineEvent]] = {
            category: [] for category in MemoryCategory
        }
        for event in events:
            sections[event.category].append(event)

        return DoctorSummary(
            generated_at=datetime.now(UTC),
            event_count=len(events),
            sections={category: tuple(items) for category, items in sections.items()},
            disclaimer=MEDICAL_DISCLAIMER,
        )

    def delete_event(self, user_id: str, event_id: UUID) -> None:
        self._repository.delete_event(user_id, event_id)

    def archive_event(self, user_id: str, event_id: UUID) -> TimelineEvent:
        return self._repository.archive_event(user_id, event_id)
