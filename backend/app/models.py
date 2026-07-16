from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.domain import EventSource, MemoryCategory, TimelineEvent


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


class TimelineEventRecord(Base):
    __tablename__ = "timeline_events"
    __table_args__ = (
        Index("ix_timeline_events_user_time", "user_id", "occurred_at"),
        Index("ix_timeline_events_user_category", "user_id", "category"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    linked_entities: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @classmethod
    def from_domain(cls, user_id: str, event: TimelineEvent) -> "TimelineEventRecord":
        return cls(
            id=str(event.id),
            user_id=user_id,
            category=event.category.value,
            source=event.source.value,
            title=event.title,
            details=event.details,
            occurred_at=event.occurred_at,
            linked_entities="\n".join(event.linked_entities),
            created_at=event.created_at,
            archived_at=event.archived_at,
        )

    def to_domain(self) -> TimelineEvent:
        return TimelineEvent(
            id=UUID(self.id),
            category=MemoryCategory(self.category),
            source=EventSource(self.source),
            title=self.title,
            details=self.details,
            occurred_at=as_utc(self.occurred_at),
            linked_entities=tuple(
                entity for entity in self.linked_entities.split("\n") if entity
            ),
            created_at=as_utc(self.created_at),
            archived_at=as_utc(self.archived_at) if self.archived_at else None,
        )


class UserRecord(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_email", "email"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
