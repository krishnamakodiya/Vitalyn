from __future__ import annotations

import json
import base64
from dataclasses import dataclass
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
        if not self._settings.gemini_api_key.startswith("AIza"):
            raise AiNotConfiguredError(
                "GEMINI_API_KEY does not look like a Google AI Studio API key. "
                "Create a key that starts with AIza, then restart the backend."
            )

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
            raise AiProviderError(f"Gemini rejected the transcription request: {message}") from exc
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
