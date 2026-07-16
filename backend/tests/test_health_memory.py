from datetime import UTC, datetime

import pytest

from app.domain import EventSource, MemoryCategory
from app.repository import InMemoryHealthMemoryRepository
from app.service import HealthMemoryService


@pytest.fixture
def service() -> HealthMemoryService:
    return HealthMemoryService(InMemoryHealthMemoryRepository())


def test_events_are_stored_in_chronological_order(service: HealthMemoryService) -> None:
    service.create_event(
        user_id="user-1",
        category=MemoryCategory.CONVERSATION,
        source=EventSource.VOICE_JOURNAL,
        title="Evening symptom note",
        details="Had a mild headache after work.",
        occurred_at=datetime(2026, 7, 15, 20, 0, tzinfo=UTC),
    )
    service.create_event(
        user_id="user-1",
        category=MemoryCategory.LONG_TERM,
        source=EventSource.MANUAL,
        title="Morning sleep note",
        details="Slept seven hours.",
        occurred_at=datetime(2026, 7, 15, 8, 0, tzinfo=UTC),
    )

    events = service.list_events("user-1")

    assert [event.title for event in events] == [
        "Morning sleep note",
        "Evening symptom note",
    ]


def test_events_can_be_filtered_by_memory_category(service: HealthMemoryService) -> None:
    service.create_event(
        user_id="user-1",
        category=MemoryCategory.MEDICAL,
        source=EventSource.DOCTOR_VISIT,
        title="Doctor visit",
        details="Discussed recurring knee pain.",
        occurred_at=datetime(2026, 7, 10, 10, 0, tzinfo=UTC),
    )
    service.create_event(
        user_id="user-1",
        category=MemoryCategory.LONG_TERM,
        source=EventSource.WEARABLE,
        title="Workout",
        details="Completed a thirty minute walk.",
        occurred_at=datetime(2026, 7, 10, 18, 0, tzinfo=UTC),
    )

    events = service.list_events("user-1", MemoryCategory.MEDICAL)

    assert len(events) == 1
    assert events[0].title == "Doctor visit"


def test_doctor_summary_is_factual_and_includes_disclaimer(service: HealthMemoryService) -> None:
    service.create_event(
        user_id="user-1",
        category=MemoryCategory.PERMANENT,
        source=EventSource.MANUAL,
        title="Allergy",
        details="Reports allergy to penicillin.",
        occurred_at=datetime(2026, 7, 1, 9, 0, tzinfo=UTC),
        linked_entities=("penicillin",),
    )

    summary = service.build_doctor_summary("user-1")

    assert summary.event_count == 1
    assert MemoryCategory.PERMANENT in summary.sections
    assert "does not diagnose" in summary.disclaimer


def test_doctor_reported_diagnoses_can_be_stored_as_history(
    service: HealthMemoryService,
) -> None:
    event = service.create_event(
        user_id="user-1",
        category=MemoryCategory.MEDICAL,
        source=EventSource.DOCTOR_VISIT,
        title="Doctor visit",
        details="Doctor noted a migraine diagnosis in the visit summary.",
        occurred_at=datetime(2026, 7, 15, 9, 0, tzinfo=UTC),
    )

    assert event.details == "Doctor noted a migraine diagnosis in the visit summary."


def test_events_are_not_silently_deleted(service: HealthMemoryService) -> None:
    event = service.create_event(
        user_id="user-1",
        category=MemoryCategory.MEDICAL,
        source=EventSource.REPORT_UPLOAD,
        title="Blood report uploaded",
        details="Uploaded CBC report.",
        occurred_at=datetime(2026, 7, 12, 12, 0, tzinfo=UTC),
    )

    with pytest.raises(PermissionError, match="never silently deletes"):
        service.delete_event("user-1", event.id)


def test_events_can_be_archived_without_erasing_history(
    service: HealthMemoryService,
) -> None:
    event = service.create_event(
        user_id="user-1",
        category=MemoryCategory.CONVERSATION,
        source=EventSource.VOICE_JOURNAL,
        title="Symptom note",
        details="Mild headache after work.",
        occurred_at=datetime(2026, 7, 15, 19, 30, tzinfo=UTC),
    )

    archived = service.archive_event("user-1", event.id)

    assert archived.archived_at is not None
    assert service.list_events("user-1") == ()
    assert service.list_events("user-1", include_archived=True)[0].id == event.id
