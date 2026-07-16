from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain import MemoryCategory, TimelineEvent
from app.models import TimelineEventRecord


class HealthMemoryRepository(Protocol):
    def add_event(self, user_id: str, event: TimelineEvent) -> TimelineEvent:
        raise NotImplementedError

    def list_events(
        self,
        user_id: str,
        category: MemoryCategory | None = None,
        include_archived: bool = False,
    ) -> tuple[TimelineEvent, ...]:
        raise NotImplementedError

    def get_event(self, user_id: str, event_id: UUID) -> TimelineEvent | None:
        raise NotImplementedError

    def archive_event(self, user_id: str, event_id: UUID) -> TimelineEvent:
        raise NotImplementedError

    def delete_event(self, user_id: str, event_id: UUID) -> None:
        raise NotImplementedError


class SqlHealthMemoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add_event(self, user_id: str, event: TimelineEvent) -> TimelineEvent:
        record = TimelineEventRecord.from_domain(user_id, event)
        self._session.add(record)
        self._session.commit()
        self._session.refresh(record)
        return record.to_domain()

    def list_events(
        self,
        user_id: str,
        category: MemoryCategory | None = None,
        include_archived: bool = False,
    ) -> tuple[TimelineEvent, ...]:
        statement = select(TimelineEventRecord).where(
            TimelineEventRecord.user_id == user_id
        )
        if category is not None:
            statement = statement.where(TimelineEventRecord.category == category.value)
        if not include_archived:
            statement = statement.where(TimelineEventRecord.archived_at.is_(None))
        statement = statement.order_by(TimelineEventRecord.occurred_at.asc())
        records = self._session.scalars(statement).all()
        return tuple(record.to_domain() for record in records)

    def get_event(self, user_id: str, event_id: UUID) -> TimelineEvent | None:
        record = self._session.get(TimelineEventRecord, str(event_id))
        if record is None or record.user_id != user_id:
            return None
        return record.to_domain()

    def archive_event(self, user_id: str, event_id: UUID) -> TimelineEvent:
        record = self._session.get(TimelineEventRecord, str(event_id))
        if record is None or record.user_id != user_id:
            raise LookupError("timeline event not found")
        if record.archived_at is None:
            record.archived_at = datetime.now(UTC)
            self._session.commit()
            self._session.refresh(record)
        return record.to_domain()

    def delete_event(self, user_id: str, event_id: UUID) -> None:
        raise PermissionError(
            "Vitalyn never silently deletes medical history. Archive/retraction flow required."
        )


class InMemoryHealthMemoryRepository:
    def __init__(self) -> None:
        self._events_by_user: dict[str, list[TimelineEvent]] = defaultdict(list)

    def add_event(self, user_id: str, event: TimelineEvent) -> TimelineEvent:
        self._events_by_user[user_id].append(event)
        self._events_by_user[user_id].sort(key=lambda item: item.occurred_at)
        return event

    def list_events(
        self,
        user_id: str,
        category: MemoryCategory | None = None,
        include_archived: bool = False,
    ) -> tuple[TimelineEvent, ...]:
        events = self._events_by_user[user_id]
        if not include_archived:
            events = [event for event in events if event.archived_at is None]
        if category is None:
            return tuple(events)
        return tuple(event for event in events if event.category == category)

    def get_event(self, user_id: str, event_id: UUID) -> TimelineEvent | None:
        for event in self._events_by_user[user_id]:
            if event.id == event_id:
                return event
        return None

    def delete_event(self, user_id: str, event_id: UUID) -> None:
        raise PermissionError(
            "Vitalyn never silently deletes medical history. Archive/retraction flow required."
        )

    def archive_event(self, user_id: str, event_id: UUID) -> TimelineEvent:
        for index, event in enumerate(self._events_by_user[user_id]):
            if event.id == event_id:
                archived = TimelineEvent(
                    id=event.id,
                    category=event.category,
                    source=event.source,
                    title=event.title,
                    details=event.details,
                    occurred_at=event.occurred_at,
                    linked_entities=event.linked_entities,
                    created_at=event.created_at,
                    archived_at=datetime.now(UTC),
                )
                self._events_by_user[user_id][index] = archived
                return archived
        raise LookupError("timeline event not found")
