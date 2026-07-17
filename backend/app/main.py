from __future__ import annotations

from collections.abc import Iterator
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime
import json
from time import monotonic
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai_provider import AiNotConfiguredError, AiProviderError, transcribe_audio_with_config
from app.auth_service import AuthError, AuthService
from app.config import Settings, get_settings
from app.database import get_db_session, init_db
from app.domain import MemoryCategory
from app.domain import EventSource
from app.models import HealthRecord, UserRecord, as_utc
from app.repository import SqlHealthMemoryRepository
from app.schemas import (
    DoctorSummaryRead,
    DoctorSummarySection,
    AiAnalysisRead,
    HealthRecordCreate,
    HealthRecordRead,
    PrescriptionAnalyze,
    TimelineEventCreate,
    TimelineEventRead,
    TokenRead,
    UserLogin,
    UserRead,
    UserRegister,
    VoiceJournalAnalyze,
    VoiceTranscriptionRead,
)
from app.security import verify_access_token
from app.service import HealthMemoryService
from app.user_repository import UserRepository


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Vitalyn API",
    version="0.1.0",
    description="Structured health-memory API for Vitalyn.",
    lifespan=lifespan,
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
bearer_scheme = HTTPBearer(auto_error=False)
api_v1 = APIRouter(prefix="/api/v1")
rate_limit_buckets: dict[str, deque[float]] = defaultdict(deque)

SAFETY_NOTE = (
    "This is an AI organization aid, not a diagnosis or prescription. "
    "Confirm medicines, dosage, and timing with a licensed clinician or pharmacist."
)


def extract_entities(text: str) -> list[str]:
    terms = []
    keywords = (
        "headache",
        "sleep",
        "water",
        "walk",
        "fever",
        "cough",
        "pain",
        "vitamin",
        "omega",
        "tablet",
        "capsule",
        "allergy",
        "penicillin",
        "blood",
        "report",
    )
    lowered = text.lower()
    for keyword in keywords:
        if keyword in lowered:
            terms.append(keyword)
    return list(dict.fromkeys(terms))[:8]


def voice_title(transcript: str) -> str:
    lowered = transcript.lower()
    if "headache" in lowered or "pain" in lowered:
        return "Symptom journal"
    if "sleep" in lowered:
        return "Sleep journal"
    if "walk" in lowered or "exercise" in lowered or "workout" in lowered:
        return "Activity journal"
    if "water" in lowered or "diet" in lowered or "food" in lowered:
        return "Lifestyle journal"
    return "Voice health journal"


def prescription_summary(image_name: str, question: str, entities: list[str]) -> str:
    entity_text = ", ".join(entities) if entities else "medicine names and instructions"
    return (
        f"Photo '{image_name}' was added for prescription review. "
        f"User question: {question.strip()} "
        f"Prototype extraction found: {entity_text}. "
        "Use this to organize questions for a doctor or pharmacist; do not change medicines without professional advice."
    )


ALLOWED_RECORD_TYPES = {
    "medications",
    "reports",
    "prescriptions",
    "wearables",
    "reminders",
    "insights",
    "chat_messages",
}


def ensure_record_type(record_type: str) -> str:
    if record_type not in ALLOWED_RECORD_TYPES:
        raise HTTPException(status_code=404, detail="record type not found")
    return record_type


def health_record_read(record: HealthRecord) -> HealthRecordRead:
    return HealthRecordRead(
        id=record.id,
        record_type=record.record_type,
        title=record.title,
        details=record.details,
        metadata=json.loads(record.metadata_json or "{}"),
        occurred_at=as_utc(record.occurred_at),
        created_at=as_utc(record.created_at),
        archived_at=as_utc(record.archived_at) if record.archived_at else None,
    )


@app.middleware("http")
async def rate_limit(request: Request, call_next) -> Response:
    settings = get_settings()
    client_host = request.client.host if request.client else "unknown"
    bucket_key = f"{client_host}:{request.url.path}"
    now = monotonic()
    bucket = rate_limit_buckets[bucket_key]
    while bucket and now - bucket[0] > settings.rate_limit_window_seconds:
        bucket.popleft()
    if len(bucket) >= settings.rate_limit_requests:
        return Response(
            content='{"detail":"rate limit exceeded"}',
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            media_type="application/json",
        )
    bucket.append(now)
    return await call_next(request)


def get_health_memory_service(
    session: Session = Depends(get_db_session),
) -> Iterator[HealthMemoryService]:
    yield HealthMemoryService(SqlHealthMemoryRepository(session))


def get_auth_service(
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Iterator[AuthService]:
    yield AuthService(UserRepository(session), settings)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> UserRecord:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="authentication required")
    try:
        user_id = verify_access_token(credentials.credentials, settings)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="invalid access token") from exc

    user = UserRepository(session).get_by_id(user_id)
    if user is None or user.disabled_at is not None:
        raise HTTPException(status_code=401, detail="invalid access token")
    return user


def user_read(user: UserRecord) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def frontend_redirect() -> RedirectResponse:
    return RedirectResponse("http://127.0.0.1:5173/")


@api_v1.get("/health")
async def api_health() -> dict[str, str]:
    return {"status": "ok"}


@api_v1.post(
    "/auth/register",
    response_model=TokenRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_user(
    payload: UserRegister,
    service: AuthService = Depends(get_auth_service),
) -> TokenRead:
    try:
        user = service.register(
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
        )
        _, token = service.login(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TokenRead(access_token=token, user=user_read(user))


@api_v1.post("/auth/login", response_model=TokenRead)
async def login_user(
    payload: UserLogin,
    service: AuthService = Depends(get_auth_service),
) -> TokenRead:
    try:
        user, token = service.login(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return TokenRead(access_token=token, user=user_read(user))


@api_v1.get("/auth/me", response_model=UserRead)
async def get_me(user: UserRecord = Depends(get_current_user)) -> UserRead:
    return user_read(user)


@api_v1.post(
    "/timeline-events",
    response_model=TimelineEventRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_timeline_event(
    payload: TimelineEventCreate,
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> TimelineEventRead:
    try:
        event = service.create_event(
            user_id=user.id,
            category=payload.category,
            source=payload.source,
            title=payload.title,
            details=payload.details,
            occurred_at=payload.occurred_at,
            linked_entities=tuple(payload.linked_entities),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TimelineEventRead.model_validate(event)


@api_v1.get("/timeline-events", response_model=list[TimelineEventRead])
async def list_timeline_events(
    category: MemoryCategory | None = Query(default=None),
    include_archived: bool = Query(default=False),
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> list[TimelineEventRead]:
    events = service.list_events(
        user_id=user.id,
        category=category,
        include_archived=include_archived,
    )
    return [TimelineEventRead.model_validate(event) for event in events]


@api_v1.get("/doctor-summary", response_model=DoctorSummaryRead)
async def get_doctor_summary(
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> DoctorSummaryRead:
    summary = service.build_doctor_summary(user.id)
    return DoctorSummaryRead(
        generated_at=summary.generated_at,
        event_count=summary.event_count,
        disclaimer=summary.disclaimer,
        sections=[
            DoctorSummarySection(
                category=category,
                events=[TimelineEventRead.model_validate(event) for event in events],
            )
            for category, events in summary.sections.items()
            if events
        ],
    )


@api_v1.post("/ai/voice-journal", response_model=AiAnalysisRead)
async def analyze_voice_journal(
    payload: VoiceJournalAnalyze,
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> AiAnalysisRead:
    transcript = payload.transcript.strip()
    entities = extract_entities(transcript)
    title = voice_title(transcript)
    details = (
        f"Voice journal transcript: {transcript} "
        "AI structured this into health memory for timeline review."
    )
    event = service.create_event(
        user_id=user.id,
        category=MemoryCategory.CONVERSATION,
        source=EventSource.VOICE_JOURNAL,
        title=title,
        details=details,
        occurred_at=datetime.now(UTC),
        linked_entities=tuple(entities),
    )
    return AiAnalysisRead(
        title=title,
        summary=details,
        extracted_entities=entities,
        safety_note=SAFETY_NOTE,
        created_event=TimelineEventRead.model_validate(event),
    )


@api_v1.post("/ai/voice-transcription", response_model=VoiceTranscriptionRead)
async def transcribe_voice_recording(
    audio: UploadFile = File(...),
    user: UserRecord = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> VoiceTranscriptionRead:
    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="audio file is empty")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audio file must be 10 MB or smaller")
    try:
        result = transcribe_audio_with_config(
            settings,
            filename=audio.filename or "recording.webm",
            content_type=audio.content_type or "audio/webm",
            audio_bytes=content,
        )
    except AiNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AiProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return VoiceTranscriptionRead(
        transcript=result.transcript,
        provider=result.provider,
        model=result.model,
    )


@api_v1.post("/ai/prescription-photo", response_model=AiAnalysisRead)
async def analyze_prescription_photo(
    payload: PrescriptionAnalyze,
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> AiAnalysisRead:
    combined_text = f"{payload.image_name} {payload.question}"
    entities = extract_entities(combined_text)
    summary = prescription_summary(payload.image_name, payload.question, entities)
    event = service.create_event(
        user_id=user.id,
        category=MemoryCategory.MEDICAL,
        source=EventSource.PRESCRIPTION_OCR,
        title="Prescription photo question",
        details=summary,
        occurred_at=datetime.now(UTC),
        linked_entities=tuple(entities),
    )
    return AiAnalysisRead(
        title="Prescription photo question",
        summary=summary,
        extracted_entities=entities,
        safety_note=SAFETY_NOTE,
        created_event=TimelineEventRead.model_validate(event),
    )


@api_v1.get("/records/{record_type}", response_model=list[HealthRecordRead])
async def list_health_records(
    record_type: str,
    include_archived: bool = Query(default=False),
    user: UserRecord = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> list[HealthRecordRead]:
    record_type = ensure_record_type(record_type)
    statement = select(HealthRecord).where(
        HealthRecord.user_id == user.id,
        HealthRecord.record_type == record_type,
    )
    if not include_archived:
        statement = statement.where(HealthRecord.archived_at.is_(None))
    statement = statement.order_by(HealthRecord.occurred_at.desc())
    return [health_record_read(record) for record in session.scalars(statement).all()]


@api_v1.post(
    "/records/{record_type}",
    response_model=HealthRecordRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_health_record(
    record_type: str,
    payload: HealthRecordCreate,
    user: UserRecord = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> HealthRecordRead:
    record_type = ensure_record_type(record_type)
    now = datetime.now(UTC)
    record = HealthRecord(
        id=str(uuid4()),
        user_id=user.id,
        record_type=record_type,
        title=payload.title.strip(),
        details=payload.details.strip(),
        metadata_json=json.dumps(payload.metadata),
        occurred_at=payload.occurred_at or now,
        created_at=now,
        archived_at=None,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return health_record_read(record)


@api_v1.post("/records/{record_type}/{record_id}/archive", response_model=HealthRecordRead)
async def archive_health_record(
    record_type: str,
    record_id: str,
    user: UserRecord = Depends(get_current_user),
    session: Session = Depends(get_db_session),
) -> HealthRecordRead:
    record_type = ensure_record_type(record_type)
    record = session.get(HealthRecord, record_id)
    if record is None or record.user_id != user.id or record.record_type != record_type:
        raise HTTPException(status_code=404, detail="record not found")
    if record.archived_at is None:
        record.archived_at = datetime.now(UTC)
        session.commit()
        session.refresh(record)
    return health_record_read(record)


@api_v1.delete("/timeline-events/{event_id}", status_code=status.HTTP_409_CONFLICT)
async def delete_timeline_event(
    event_id: UUID,
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> dict[str, str]:
    try:
        service.delete_event(user_id=user.id, event_id=event_id)
    except PermissionError as exc:
        return {"detail": str(exc)}
    return {"detail": "deleted"}


@api_v1.post("/timeline-events/{event_id}/archive", response_model=TimelineEventRead)
async def archive_timeline_event(
    event_id: UUID,
    user: UserRecord = Depends(get_current_user),
    service: HealthMemoryService = Depends(get_health_memory_service),
) -> TimelineEventRead:
    try:
        event = service.archive_event(user_id=user.id, event_id=event_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return TimelineEventRead.model_validate(event)


app.include_router(api_v1)
