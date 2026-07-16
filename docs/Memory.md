# Vitalyn Development Memory

## Completed Work

- Created initial FastAPI backend scaffold.
- Created SQL-backed timeline event persistence with local SQLite default.
- Added health-memory domain model and repository interface.
- Added archive semantics and deletion refusal for medical history.
- Added facts-only doctor summary generation with medical safety disclaimer.
- Added initial Flutter shell for journal, timeline, and doctor mode.
- Added required product documentation set under `/docs`.
- Added `/api/v1` route versioning.
- Added user registration, login, `/auth/me`, Bearer JWT auth, and PBKDF2 password hashing.
- Replaced spoofable `X-User-Id` timeline access with authenticated user context.
- Added in-process rate limiting foundation.
- Added Alembic initial migration for `users` and `timeline_events`.
- Added API tests for auth, user isolation, archive behavior, deletion refusal, and doctor summaries.
- Decided to build the website/web app before continuing mobile because web tooling is available and it can validate the product flow faster.
- Built a full website-first prototype matching the requested health dashboard direction: Sunny Shah demo workspace, dashboard metrics, AI health chat, journal, timeline, medications, reports, prescriptions, wearables, doctor summary, reminders, insights, settings, and responsive layout.
- Verified the web app with `npm test`, `npm run build`, desktop browser inspection, and mobile-width overflow checks.

## Remaining Work

- Add production deployment hardening for Phase 1.
- Replace in-process rate limiting with Redis-backed limits before scale testing.
- Add normalized database entities beyond timeline events.
- Improve website prototype with real persistence for every module beyond timeline events.
- Add Flutter Riverpod/GoRouter architecture after web validation.
- Add AI ingestion, OCR, STT, and LLM structured outputs.
- Add doctor summary PDF export.

## Current Architecture

- FastAPI backend.
- SQLAlchemy persistence.
- Alembic migrations.
- JWT authentication.
- SQLite local development database, PostgreSQL intended for production.
- Flutter mobile shell.
- Website-first frontend is now the active client direction.
- React/Vite web frontend runs on `http://127.0.0.1:5173`.
- FastAPI backend runs on `http://127.0.0.1:8000`.

## Database Changes

- `users` table with ID, email, password hash, display name, role, creation timestamp, and disabled timestamp.
- `timeline_events` table with user ID, category, source, title, details, occurrence timestamp, linked entities, creation timestamp, and archive timestamp.
- Initial migration: `20260715_0001_initial`.

## Bugs And Risks

- Local SQLite is not a production substitute.
- Flutter cannot be verified until Flutter tooling is installed.
- Current rate limiter is in-process and must move to Redis for multi-instance production.
- Most prototype modules use rich local demo data; timeline/auth connects to backend where available.

## Technical Decisions

- Archive medical history instead of destructive deletion.
- Keep domain/service logic separate from API route handlers.
- Keep doctor summaries factual and non-diagnostic.
- Use Bearer JWTs for API auth.
- Use PBKDF2 password hashing from the Python standard library for the first auth slice.
- Require `JWT_SECRET` in production.
- Prioritize web app foundation before mobile app foundation.
- Use Sunny Shah as the seeded prototype persona for product demos.

## Next Development Task

Persist the additional prototype modules in the backend: medications, reports, prescriptions, wearable data, reminders, insights, and chat messages.
