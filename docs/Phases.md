# Development Phases

## Phase 0: Project Contract And Documentation

Status: Complete for initial build.

- Create required product docs in `/docs`.
- Establish implementation memory.
- Define build order and technical standards.

## Phase 1: Secure Backend Foundation

Status: Backend slice complete; production deployment hardening remains.

- Version REST APIs under `/api/v1`. Done.
- Add user registration and JWT login. Done.
- Require authenticated user context for health-memory APIs. Done.
- Add password hashing and environment-driven secrets. Done.
- Add rate limiting foundation. Done with in-process limiter; Redis-backed limiter remains for production scale.
- Add SQL persistence and migration-ready schema. Done with Alembic initial migration.
- Keep deletion refusal and archive semantics. Done.
- Add API and unit tests. Done for current backend slice.

## Phase 2: Web App Foundation

Status: Prototype complete; backend persistence expansion remains.

- Build a production-style responsive web app first. Done for prototype.
- Add authenticated register/login flow against `/api/v1`. Done.
- Add timeline event creation, timeline browsing, and doctor mode summary. Done.
- Add light/dark theme support. Done.
- Add reusable UI and API client modules. Started.
- Add frontend build verification and focused tests. Done for current slice.
- Add full demo workspace modules. Done with prototype data.
- Keep Flutter mobile work pending until the product flow is validated on web.

## Phase 2B: Mobile App Foundation

Status: Pending.

- Convert Flutter shell to feature-based architecture.
- Add Riverpod and GoRouter.
- Add light/dark Material 3 theme.
- Add API client and secure token storage.
- Add offline journal queue.
- Add widget tests.

## Phase 3: Health Memory Expansion

Status: Pending.

- Add normalized medical history, medicines, prescriptions, reports, symptoms, wearable data, insights, notifications, and doctor summary records.
- Add explicit consent records for exports/sharing.
- Add audit fields for data provenance.

## Phase 4: AI Capture

Status: Pending.

- Add speech-to-text ingestion.
- Add OCR ingestion.
- Add LLM extraction with structured outputs.
- Add confidence and review status for AI-created events.

## Phase 5: Doctor Mode And Reports

Status: Pending.

- Generate PDF doctor summaries.
- Add facts-only summary validation.
- Add share/export consent flow.

## Phase 6: Integrations And Scale

Status: Pending.

- Add Redis-backed rate limiting and caching.
- Add object storage.
- Add Apple Health and Google Health Connect.
- Add production Docker deployment profile.
