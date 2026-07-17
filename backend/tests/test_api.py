from fastapi.testclient import TestClient
from uuid import uuid4

from app.main import app


def register_user(client: TestClient, label: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"{label}-{uuid4()}@example.com",
            "password": "correct-horse-battery-staple",
            "display_name": label,
        },
    )
    assert response.status_code == 201
    body = response.json()
    return {
        "authorization": f"Bearer {body['access_token']}",
        "user_id": body["user"]["id"],
    }


def test_timeline_event_api_round_trip() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "api-user")
        response = client.post(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
            json={
                "category": "medical",
                "source": "doctor_visit",
                "title": "Follow-up visit",
                "details": "Reviewed knee pain and medication use.",
                "occurred_at": "2026-07-15T10:00:00Z",
                "linked_entities": ["knee pain"],
            },
        )

        assert response.status_code == 201
        created = response.json()
        assert created["title"] == "Follow-up visit"

        list_response = client.get(
            "/api/v1/timeline-events?category=medical",
            headers={"Authorization": auth["authorization"]},
        )

        assert list_response.status_code == 200
        assert [event["id"] for event in list_response.json()] == [created["id"]]


def test_doctor_summary_api_groups_fact_sections() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "summary-user")
        client.post(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
            json={
                "category": "permanent",
                "source": "manual",
                "title": "Allergy",
                "details": "Reports allergy to penicillin.",
                "occurred_at": "2026-07-01T09:00:00Z",
                "linked_entities": ["penicillin"],
            },
        )

        response = client.get(
            "/api/v1/doctor-summary",
            headers={"Authorization": auth["authorization"]},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["event_count"] == 1
        assert body["sections"][0]["category"] == "permanent"
        assert "does not diagnose" in body["disclaimer"]


def test_delete_api_requires_non_silent_history_flow() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "delete-user")
        create_response = client.post(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
            json={
                "category": "medical",
                "source": "report_upload",
                "title": "Report uploaded",
                "details": "Uploaded CBC report.",
                "occurred_at": "2026-07-12T12:00:00Z",
            },
        )

        response = client.delete(
            f"/api/v1/timeline-events/{create_response.json()['id']}",
            headers={"Authorization": auth["authorization"]},
        )

        assert response.status_code == 409
        assert "never silently deletes" in response.json()["detail"]


def test_archive_api_hides_event_without_deleting_history() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "archive-user")
        create_response = client.post(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
            json={
                "category": "conversation",
                "source": "voice_journal",
                "title": "Symptom note",
                "details": "Mild headache after work.",
                "occurred_at": "2026-07-15T19:30:00Z",
            },
        )
        event_id = create_response.json()["id"]

        archive_response = client.post(
            f"/api/v1/timeline-events/{event_id}/archive",
            headers={"Authorization": auth["authorization"]},
        )
        visible_response = client.get(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
        )
        full_history_response = client.get(
            "/api/v1/timeline-events?include_archived=true",
            headers={"Authorization": auth["authorization"]},
        )

        assert archive_response.status_code == 200
        assert archive_response.json()["archived_at"] is not None
        assert visible_response.json() == []
        assert [event["id"] for event in full_history_response.json()] == [event_id]


def test_timeline_events_require_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/timeline-events")

        assert response.status_code == 401
        assert response.json()["detail"] == "authentication required"


def test_users_cannot_read_each_others_timeline_events() -> None:
    with TestClient(app) as client:
        first_auth = register_user(client, "first-user")
        second_auth = register_user(client, "second-user")
        create_response = client.post(
            "/api/v1/timeline-events",
            headers={"Authorization": first_auth["authorization"]},
            json={
                "category": "medical",
                "source": "doctor_visit",
                "title": "Private visit",
                "details": "A user-specific doctor visit note.",
                "occurred_at": "2026-07-15T11:00:00Z",
            },
        )

        first_list = client.get(
            "/api/v1/timeline-events",
            headers={"Authorization": first_auth["authorization"]},
        )
        second_list = client.get(
            "/api/v1/timeline-events",
            headers={"Authorization": second_auth["authorization"]},
        )

        assert create_response.status_code == 201
        assert len(first_list.json()) == 1
        assert second_list.json() == []


def test_login_and_me_endpoint_return_authenticated_user() -> None:
    email = f"login-user-{uuid4()}@example.com"
    password = "correct-horse-battery-staple"

    with TestClient(app) as client:
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "display_name": "Login User",
            },
        )
        login_response = client.post(
            "/api/v1/auth/login",
            json={"email": email.upper(), "password": password},
        )
        me_response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
        )

        assert register_response.status_code == 201
        assert login_response.status_code == 200
        assert me_response.status_code == 200
        assert me_response.json()["email"] == email


def test_voice_journal_analysis_creates_timeline_event() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "voice-user")
        response = client.post(
            "/api/v1/ai/voice-journal",
            headers={"Authorization": auth["authorization"]},
            json={"transcript": "I slept well last night and had a mild headache after lunch."},
        )
        timeline_response = client.get(
            "/api/v1/timeline-events",
            headers={"Authorization": auth["authorization"]},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["created_event"]["source"] == "voice_journal"
        assert "headache" in body["extracted_entities"]
        assert len(timeline_response.json()) == 1


def test_voice_transcription_requires_authentication() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/ai/voice-transcription",
            files={"audio": ("note.webm", b"audio-bytes", "audio/webm")},
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "authentication required"


def test_voice_transcription_reports_missing_provider_configuration(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(app) as client:
        auth = register_user(client, "transcribe-user")
        response = client.post(
            "/api/v1/ai/voice-transcription",
            headers={"Authorization": auth["authorization"]},
            files={"audio": ("note.webm", b"audio-bytes", "audio/webm")},
        )

        assert response.status_code == 503
        assert "OPENAI_API_KEY" in response.json()["detail"]


def test_voice_transcription_reports_invalid_gemini_key(monkeypatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.not-a-google-ai-studio-key")
    with TestClient(app) as client:
        auth = register_user(client, "gemini-transcribe-user")
        response = client.post(
            "/api/v1/ai/voice-transcription",
            headers={"Authorization": auth["authorization"]},
            files={"audio": ("note.webm", b"audio-bytes", "audio/webm")},
        )

        assert response.status_code == 503
        assert "starts with AIza" in response.json()["detail"]


def test_prescription_photo_analysis_creates_medical_memory() -> None:
    with TestClient(app) as client:
        auth = register_user(client, "rx-user")
        response = client.post(
            "/api/v1/ai/prescription-photo",
            headers={"Authorization": auth["authorization"]},
            json={
                "image_name": "vitamin-d-prescription.jpg",
                "image_data": "data:image/jpeg;base64,ZHVtbXk=",
                "question": "What is this Vitamin D tablet for and when should I ask my doctor?",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["created_event"]["category"] == "medical"
        assert body["created_event"]["source"] == "prescription_ocr"
        assert "not a diagnosis" in body["safety_note"]


def test_health_records_are_user_scoped_and_archivable() -> None:
    with TestClient(app) as client:
        first_auth = register_user(client, "records-first")
        second_auth = register_user(client, "records-second")

        create_response = client.post(
            "/api/v1/records/medications",
            headers={"Authorization": first_auth["authorization"]},
            json={
                "title": "Vitamin D3",
                "details": "1000 IU after breakfast",
                "metadata": {"status": "active", "dose": "1000 IU"},
            },
        )
        assert create_response.status_code == 201
        record_id = create_response.json()["id"]

        first_list = client.get(
            "/api/v1/records/medications",
            headers={"Authorization": first_auth["authorization"]},
        )
        second_list = client.get(
            "/api/v1/records/medications",
            headers={"Authorization": second_auth["authorization"]},
        )
        archive_response = client.post(
            f"/api/v1/records/medications/{record_id}/archive",
            headers={"Authorization": first_auth["authorization"]},
        )
        visible_after_archive = client.get(
            "/api/v1/records/medications",
            headers={"Authorization": first_auth["authorization"]},
        )

        assert [record["id"] for record in first_list.json()] == [record_id]
        assert second_list.json() == []
        assert archive_response.status_code == 200
        assert archive_response.json()["archived_at"] is not None
        assert visible_after_archive.json() == []
