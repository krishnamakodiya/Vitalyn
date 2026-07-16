# Vitalyn Implementation Plan

## Product Direction

Vitalyn should start as a health-memory product, not a general chatbot. The first release should make it easy to capture health events, preserve them chronologically, retrieve them by category, and generate factual doctor summaries with clear medical-safety boundaries.

## Phase 1: Foundations

- Build the FastAPI backend with structured timeline events, memory categories, source tracking, persistence, archiving, and doctor summary generation.
- Build a Flutter app shell with daily journal capture, timeline browsing, and doctor mode.
- Store every event with timestamp, category, source, title, details, and linked entities.
- Add rules that prevent diagnosis, preserve medical history, and show consent requirements before sharing.
- Add tests for chronology, event creation, doctor summaries, and non-deletion behavior.

## Phase 2: Persistence And Accounts

- Add production PostgreSQL deployment and migrations for users, profiles, timeline events, prescriptions, medications, reports, and share consents.
- Add authentication and user-scoped data access.
- Add encrypted object storage for prescriptions, reports, and images.
- Add Redis for caching common reads and background job coordination.
- Add migration tooling and seeded local development data.

## Phase 3: Capture Intelligence

- Add speech-to-text ingestion for daily voice journals.
- Add OCR ingestion for prescriptions and medical reports.
- Use an LLM only to convert unstructured input into structured health-memory events and simple explanations.
- Add an offline journal queue in the mobile app.
- Add confidence, source, and review status to AI-extracted events.

## Phase 4: Insights And Doctor Mode

- Add weekly and monthly summaries using structured history.
- Add symptom timelines and medication memory views.
- Generate exportable PDF doctor summaries with facts only.
- Add explicit consent flow before any share or export.
- Add early-risk awareness as non-diagnostic pattern flags with recommendation to consult a professional when appropriate.

## Phase 5: Integrations

- Integrate Apple Health and Google Health Connect for sleep, activity, heart rate, weight, and workouts.
- Add wearable sync jobs and normalization.
- Add report/image upload flows.
- Add RAG over user-approved medical reports after the structured memory layer is stable.

## First Build Priorities

1. Backend health-memory API. Done for the initial timeline and summary slice.
2. Mobile app shell and API contract. Started.
3. PostgreSQL persistence. SQL repository exists; production migrations and DB service remain.
4. Voice journal ingestion.
5. Prescription OCR ingestion.
6. Doctor summary PDF export.
