# System Architecture

## Frontend

- Flutter
- Riverpod
- GoRouter
- Material 3
- Offline queue and secure local storage

## Backend

- FastAPI
- Python
- Pydantic
- SQLAlchemy
- Alembic migrations
- JWT authentication
- REST APIs under `/api/v1`
- Structured logging

## AI Services

- Speech-to-text for voice journaling
- OCR for prescriptions and medical reports
- LLM extraction into structured health memory
- Embedding/RAG for approved report retrieval in a later phase

## Database And Infrastructure

- PostgreSQL for production data
- SQLite only for local development defaults
- Redis for rate limiting, caching, and background coordination
- Object storage for prescriptions, medical reports, and images
- Docker Compose for local service orchestration

## Core Data Flow

- Voice -> STT -> LLM extraction -> Structured Health Memory -> Database
- Prescription -> OCR -> LLM explanation/extraction -> Medication Database -> Health Memory
- Timeline Events -> Doctor Summary -> Explicit user consent -> Export/share

## Current Architecture Decisions

- Timeline events are persisted through a repository interface so local SQLite and production PostgreSQL can share the service layer.
- Medical history is archived, not silently deleted.
- AI-generated insight data must remain distinguishable from user-provided facts.
- Authenticated user context comes from Bearer JWTs, not spoofable request headers.
- Passwords are stored as PBKDF2 hashes.
