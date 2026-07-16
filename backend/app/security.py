from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from app.config import Settings


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return "pbkdf2_sha256$210000${}${}".format(
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(digest).decode(),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, rounds_text, salt_text, digest_text = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt,
            int(rounds_text),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode())


def create_access_token(user_id: str, settings: Settings) -> str:
    now = datetime.now(UTC)
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": settings.jwt_issuer,
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
        "jti": str(uuid4()),
    }
    signing_input = "{}.{}".format(
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode()),
        _b64url_encode(json.dumps(payload, separators=(",", ":")).encode()),
    )
    signature = hmac.new(
        settings.jwt_secret.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def verify_access_token(token: str, settings: Settings) -> str:
    try:
        header_text, payload_text, signature_text = token.split(".")
        signing_input = f"{header_text}.{payload_text}"
        expected_signature = hmac.new(
            settings.jwt_secret.encode(),
            signing_input.encode(),
            hashlib.sha256,
        ).digest()
        actual_signature = _b64url_decode(signature_text)
        if not hmac.compare_digest(actual_signature, expected_signature):
            raise ValueError("invalid token signature")

        header = json.loads(_b64url_decode(header_text))
        payload = json.loads(_b64url_decode(payload_text))
        if header.get("alg") != "HS256":
            raise ValueError("unsupported token algorithm")
        if payload.get("iss") != settings.jwt_issuer:
            raise ValueError("invalid token issuer")
        if int(payload.get("exp", 0)) < int(datetime.now(UTC).timestamp()):
            raise ValueError("token expired")
        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject:
            raise ValueError("token subject missing")
        return subject
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("invalid access token") from exc

