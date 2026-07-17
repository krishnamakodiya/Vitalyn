from __future__ import annotations

import re

from app.config import Settings
from app.models import UserRecord
from app.security import create_access_token, hash_password, verify_password
from app.user_repository import DuplicateUserError, UserRepository

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(ValueError):
    pass


class AuthService:
    def __init__(self, repository: UserRepository, settings: Settings) -> None:
        self._repository = repository
        self._settings = settings

    def register(self, email: str, password: str, display_name: str) -> UserRecord:
        normalized_email = email.strip().lower()
        name = display_name.strip()
        if not EMAIL_PATTERN.match(normalized_email):
            raise AuthError("valid email is required")
        if len(password) < 8:
            raise AuthError("password must be at least 8 characters")
        if not name:
            raise AuthError("display name is required")
        try:
            return self._repository.create_user(
                email=normalized_email,
                password_hash=hash_password(password),
                display_name=name,
            )
        except DuplicateUserError as exc:
            raise AuthError(str(exc)) from exc

    def login(self, email: str, password: str) -> tuple[UserRecord, str]:
        user = self._repository.get_by_email(email.strip().lower())
        if user is None or user.disabled_at is not None:
            raise AuthError("invalid email or password")
        if not verify_password(password, user.password_hash):
            raise AuthError("invalid email or password")
        return user, create_access_token(user.id, self._settings)

