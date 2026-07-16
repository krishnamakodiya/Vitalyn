from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import UserRecord, as_utc


class DuplicateUserError(ValueError):
    pass


class UserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_user(
        self,
        email: str,
        password_hash: str,
        display_name: str,
    ) -> UserRecord:
        user = UserRecord(
            id=str(uuid4()),
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            role="user",
            created_at=datetime.now(UTC),
            disabled_at=None,
        )
        self._session.add(user)
        try:
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise DuplicateUserError("email is already registered") from exc
        self._session.refresh(user)
        return user

    def get_by_email(self, email: str) -> UserRecord | None:
        statement = select(UserRecord).where(UserRecord.email == email)
        return self._session.scalars(statement).first()

    def get_by_id(self, user_id: str) -> UserRecord | None:
        user = self._session.get(UserRecord, user_id)
        if user is None:
            return None
        if user.disabled_at is not None:
            user.disabled_at = as_utc(user.disabled_at)
        return user

