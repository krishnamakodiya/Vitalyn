from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./vitalyn.db"
    environment: str = "development"
    jwt_secret: str = "dev-only-change-me"
    jwt_issuer: str = "vitalyn-api"
    access_token_minutes: int = 60
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
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


def get_settings() -> Settings:
    environment = os.environ.get("ENVIRONMENT", Settings.environment)
    jwt_secret = os.environ.get("JWT_SECRET")
    if environment == "production" and not jwt_secret:
        raise RuntimeError("JWT_SECRET must be set in production")

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
        cors_origins=tuple(
            origin.strip()
            for origin in os.environ.get(
                "CORS_ORIGINS",
                ",".join(Settings.cors_origins),
            ).split(",")
            if origin.strip()
        ),
    )
