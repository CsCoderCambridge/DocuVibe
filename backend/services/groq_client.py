import json
import re
from functools import lru_cache
from typing import Any

import groq
from groq import Groq

from config import GROQ_API_KEY


class LLMUnavailableError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


@lru_cache(maxsize=1)
def get_client() -> Groq:
    return Groq(api_key=GROQ_API_KEY, timeout=90.0, max_retries=1)


def _should_fall_back(err: Exception) -> bool:
    if isinstance(err, (groq.RateLimitError, groq.APIConnectionError, groq.APITimeoutError, groq.NotFoundError)):
        return True
    if isinstance(err, groq.APIStatusError):
        if err.status_code >= 500:
            return True
        # Model decommissioned / not available on this account
        text = str(err).lower()
        return "model" in text and ("not found" in text or "decommissioned" in text or "does not exist" in text)
    return False


def _unique(models: list[str]) -> list[str]:
    seen: list[str] = []
    for m in models:
        if m and m not in seen:
            seen.append(m)
    return seen


def chat_with_fallback(models: list[str], **kwargs: Any) -> tuple[Any, str]:
    """Run a chat completion, trying each model in order on rate limits or server errors.

    Returns (response, model_used).
    """
    last_err: Exception | None = None
    rate_limited = False
    for model in _unique(models):
        try:
            return get_client().chat.completions.create(model=model, **kwargs), model
        except Exception as err:  # noqa: BLE001
            last_err = err
            if isinstance(err, groq.RateLimitError):
                rate_limited = True
            if not _should_fall_back(err):
                break
    status = 429 if rate_limited else 502
    raise LLMUnavailableError(f"All models failed. Last error: {last_err}", status) from last_err


def transcribe_with_fallback(models: list[str], filename: str, audio: bytes, language: str | None) -> tuple[str, str]:
    last_err: Exception | None = None
    rate_limited = False
    for model in _unique(models):
        try:
            params: dict[str, Any] = {"file": (filename, audio), "model": model, "response_format": "json"}
            if language in ("ur", "en"):
                params["language"] = language
            result = get_client().audio.transcriptions.create(**params)
            return (getattr(result, "text", "") or "").strip(), model
        except Exception as err:  # noqa: BLE001
            last_err = err
            if isinstance(err, groq.RateLimitError):
                rate_limited = True
            if not _should_fall_back(err):
                break
    status = 429 if rate_limited else 502
    raise LLMUnavailableError(f"Transcription failed. Last error: {last_err}", status) from last_err


def parse_json(text: str | None) -> dict[str, Any]:
    """Extract a JSON object from a model reply, tolerating code fences and surrounding prose."""
    if not text:
        raise ValueError("Empty model response")
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, flags=re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("No JSON object found in model response")
        data = json.loads(cleaned[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("Model response JSON is not an object")
    return data
