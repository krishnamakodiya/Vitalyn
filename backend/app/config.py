from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./vitalyn.db"
    environment: str = "development"
    jwt_secret: str = "dev-only-change-me"
    jwt_issuer: str = "vitalyn-api"
    access_token_minutes: int = 60
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    ai_provider: str = "openai"
    openai_api_key: str | None = None
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.1-flash-lite"
    cors_origins: tuple[str, ...] = (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "https://krishnamakodiya.github.io",
    )


def normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def load_local_env() -> None:
    candidates = [Path.cwd(), *Path.cwd().parents, Path(__file__).resolve().parents[2]]
    env_path = next((path / ".env" for path in candidates if (path / ".env").exists()), None)
    if env_path is None:
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_settings() -> Settings:
    load_local_env()
    environment = os.environ.get("ENVIRONMENT", Settings.environment)
    jwt_secret = os.environ.get("JWT_SECRET")
    if environment == "production" and not jwt_secret:
        raise RuntimeError("JWT_SECRET must be set in production")
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    ai_provider = os.environ.get("AI_PROVIDER")
    if ai_provider is None and gemini_api_key and not openai_api_key:
        ai_provider = "gemini"

    return Settings(
        database_url=normalize_database_url(
            os.environ.get("DATABASE_URL", Settings.database_url)
        ),
        environment=environment,
        jwt_secret=jwt_secret or Settings.jwt_secret,
        jwt_issuer=os.environ.get("JWT_ISSUER", Settings.jwt_issuer),
        access_token_minutes=int(
            os.environ.get("ACCESS_TOKEN_MINUTES", Settings.access_token_minutes)
        ),
        rate_limit_requests=int(
            os.environ.get("RATE_LIMIT_REQUESTS", Settings.rate_limit_requests)
        ),
        rate_limit_window_seconds=int(
            os.environ.get(
                "RATE_LIMIT_WINDOW_SECONDS",
                Settings.rate_limit_window_seconds,
            )
        ),
        ai_provider=(ai_provider or Settings.ai_provider).strip().lower(),
        openai_api_key=openai_api_key,
        openai_transcription_model=os.environ.get(
            "OPENAI_TRANSCRIPTION_MODEL",
            Settings.openai_transcription_model,
        ),
        gemini_api_key=gemini_api_key,
        gemini_model=os.environ.get("GEMINI_MODEL", Settings.gemini_model),
        cors_origins=tuple(
            origin.strip()
            for origin in os.environ.get(
                "CORS_ORIGINS",
                ",".join(Settings.cors_origins),
            ).split(",")
            if origin.strip()
        ),
    )
