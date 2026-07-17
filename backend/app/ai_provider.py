from __future__ import annotations

import json
import base64
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from app.config import Settings


class AiProviderError(RuntimeError):
    pass


class AiNotConfiguredError(AiProviderError):
    pass


@dataclass(frozen=True)
class TranscriptionResult:
    transcript: str
    provider: str
    model: str


class OpenAiProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def transcribe_audio(
        self,
        *,
        filename: str,
        content_type: str,
        audio_bytes: bytes,
    ) -> TranscriptionResult:
        if not self._settings.openai_api_key:
            raise AiNotConfiguredError(
                "AI transcription is not configured. Set OPENAI_API_KEY on the backend."
            )

        boundary = f"----vitalyn-{uuid4().hex}"
        body = self._multipart_body(
            boundary=boundary,
            fields={"model": self._settings.openai_transcription_model},
            files={
                "file": (
                    filename or "recording.webm",
                    content_type or "audio/webm",
                    audio_bytes,
                )
            },
        )
        request = Request(
            "https://api.openai.com/v1/audio/transcriptions",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self._settings.openai_api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise AiProviderError(f"Transcription provider rejected the request: {message}") from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AiProviderError("Transcription provider was not reachable.") from exc

        transcript = str(payload.get("text") or "").strip()
        if not transcript:
            raise AiProviderError("Transcription provider returned an empty transcript.")
        return TranscriptionResult(
            transcript=transcript,
            provider="openai",
            model=self._settings.openai_transcription_model,
        )

    @staticmethod
    def _multipart_body(
        *,
        boundary: str,
        fields: dict[str, str],
        files: dict[str, tuple[str, str, bytes]],
    ) -> bytes:
        chunks: list[bytes] = []
        for name, value in fields.items():
            chunks.extend(
                [
                    f"--{boundary}\r\n".encode(),
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                    value.encode(),
                    b"\r\n",
                ]
            )
        for name, (filename, content_type, content) in files.items():
            chunks.extend(
                [
                    f"--{boundary}\r\n".encode(),
                    (
                        f'Content-Disposition: form-data; name="{name}"; '
                        f'filename="{filename}"\r\n'
                    ).encode(),
                    f"Content-Type: {content_type}\r\n\r\n".encode(),
                    content,
                    b"\r\n",
                ]
            )
        chunks.append(f"--{boundary}--\r\n".encode())
        return b"".join(chunks)


class GeminiProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def transcribe_audio(
        self,
        *,
        filename: str,
        content_type: str,
        audio_bytes: bytes,
    ) -> TranscriptionResult:
        if not self._settings.gemini_api_key:
            raise AiNotConfiguredError(
                "Gemini transcription is not configured. Set GEMINI_API_KEY on the backend."
            )

        sdk_result = self._transcribe_with_node_sdk(
            content_type=content_type,
            audio_bytes=audio_bytes,
        )
        if sdk_result is not None:
            return sdk_result

        return self._transcribe_with_http(
            content_type=content_type,
            audio_bytes=audio_bytes,
        )

    def _transcribe_with_node_sdk(
        self,
        *,
        content_type: str,
        audio_bytes: bytes,
    ) -> TranscriptionResult | None:
        helper_path = Path(__file__).resolve().parents[1] / "scripts" / "gemini_transcribe.mjs"
        search_roots = [Path.cwd(), *Path.cwd().parents, Path(__file__).resolve().parents[2]]
        node_modules_path = next(
            (
                root / "node_modules" / "@google" / "genai"
                for root in search_roots
                if (root / "node_modules" / "@google" / "genai").exists()
            ),
            None,
        )
        if not helper_path.exists() or not node_modules_path.exists():
            return None

        env = os.environ.copy()
        env["GEMINI_API_KEY"] = self._settings.gemini_api_key or ""
        command = [
            "node",
            str(helper_path),
            self._settings.gemini_model,
            content_type or "audio/webm",
            base64.b64encode(audio_bytes).decode("ascii"),
        ]
        try:
            completed = subprocess.run(
                command,
                cwd=Path.cwd(),
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise AiProviderError("Gemini SDK transcription provider was not reachable.") from exc

        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "").strip()
            raise AiProviderError(
                f"Gemini SDK rejected the transcription request: {self._provider_message(message)}"
            )

        try:
            body = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise AiProviderError("Gemini SDK returned an invalid response.") from exc

        transcript = str(body.get("transcript") or "").strip()
        if not transcript:
            raise AiProviderError("Gemini SDK returned an empty transcript.")
        return TranscriptionResult(
            transcript=transcript,
            provider="gemini",
            model=self._settings.gemini_model,
        )

    def _transcribe_with_http(
        self,
        *,
        content_type: str,
        audio_bytes: bytes,
    ) -> TranscriptionResult:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Transcribe this health journal audio accurately. "
                                "Return only the transcript text, with no diagnosis, advice, "
                                "markdown, labels, or commentary."
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": content_type or "audio/webm",
                                "data": base64.b64encode(audio_bytes).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {"temperature": 0},
        }
        request = Request(
            (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{self._settings.gemini_model}:generateContent"
            ),
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "x-goog-api-key": self._settings.gemini_api_key,
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=60) as response:
                body = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            raise AiProviderError(
                f"Gemini rejected the transcription request: {self._provider_message(message)}"
            ) from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AiProviderError("Gemini transcription provider was not reachable.") from exc

        transcript = self._extract_text(body)
        if not transcript:
            raise AiProviderError("Gemini returned an empty transcript.")
        return TranscriptionResult(
            transcript=transcript,
            provider="gemini",
            model=self._settings.gemini_model,
        )

    @staticmethod
    def _extract_text(body: dict) -> str:
        candidates = body.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            return ""
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not isinstance(parts, list):
            return ""
        texts = [str(part.get("text", "")).strip() for part in parts if isinstance(part, dict)]
        return "\n".join(text for text in texts if text).strip()

    @staticmethod
    def _provider_message(message: str) -> str:
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            return message or "The provider returned an unknown error."
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict):
            status = str(error.get("status") or "").strip()
            text = str(error.get("message") or "").strip()
            if status == "UNAVAILABLE":
                return "Gemini is temporarily overloaded. Please try again in a minute."
            if text:
                return text
        return message or "The provider returned an unknown error."


def transcribe_audio_with_config(
    settings: Settings,
    *,
    filename: str,
    content_type: str,
    audio_bytes: bytes,
) -> TranscriptionResult:
    if settings.ai_provider == "gemini":
        return GeminiProvider(settings).transcribe_audio(
            filename=filename,
            content_type=content_type,
            audio_bytes=audio_bytes,
        )
    if settings.ai_provider == "openai":
        return OpenAiProvider(settings).transcribe_audio(
            filename=filename,
            content_type=content_type,
            audio_bytes=audio_bytes,
        )
    raise AiNotConfiguredError(
        "AI_PROVIDER must be either 'openai' or 'gemini'."
    )
