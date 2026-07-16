# Vitalyn

Personal AI Health Companion that builds a lifelong, structured health memory.

## What is in this repo

- `backend/` - FastAPI service for health memory, timeline events, doctor summaries, and safety guardrails.
- `mobile/` - Flutter app shell for journaling, timeline review, and doctor mode.
- `docs/` - Implementation plan and audit derived from the product docs.

## Current Status

This is the first implementation scaffold. The backend contains a working SQL-backed API with JWT authentication and tests for the core health-memory behavior. The mobile app is a starter Flutter shell; Flutter was not installed in this workspace when it was created, so it has not yet been run locally.

## Backend Quickstart

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

By default the backend creates a local SQLite database at `backend/vitalyn.db`. To use PostgreSQL, set `DATABASE_URL` before starting the app:

```bash
export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/vitalyn"
```

Run tests:

```bash
cd backend
pytest
```

Run migrations against a configured database:

```bash
cd backend
alembic upgrade head
```

## API Surface

- `POST /api/v1/auth/register` - create an account and receive a Bearer token.
- `POST /api/v1/auth/login` - authenticate and receive a Bearer token.
- `GET /api/v1/auth/me` - read the authenticated user profile.
- `POST /api/v1/timeline-events` - add a timestamped health-memory event.
- `GET /api/v1/timeline-events` - list visible timeline events, optionally filtered by category.
- `GET /api/v1/timeline-events?include_archived=true` - include archived historical events.
- `POST /api/v1/timeline-events/{event_id}/archive` - hide an event without erasing history.
- `DELETE /api/v1/timeline-events/{event_id}` - refused by design until a proper retraction flow exists.
- `GET /api/v1/doctor-summary` - generate a facts-only grouped summary with safety disclaimer.
