import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _env(name: str, default: str) -> str:
    value = os.getenv(name, "").strip()
    return value or default


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()

VISION_MODEL = _env("VISION_MODEL", "qwen/qwen3.8-27b")
STT_MODEL_PRIMARY = _env("STT_MODEL_PRIMARY", "whisper-large-v3-turbo")
STT_MODEL_FALLBACK = _env("STT_MODEL_FALLBACK", "whisper-large-v3")
REASONING_MODEL_PRIMARY = _env("REASONING_MODEL_PRIMARY", "openai/gpt-oss-120b")
REASONING_MODEL_FAST = _env("REASONING_MODEL_FAST", "openai/gpt-oss-20b")
REASONING_MODEL_FALLBACK = _env("REASONING_MODEL_FALLBACK", "qwen/qwen3.8-27b")

REASONING_MODELS = [REASONING_MODEL_PRIMARY, REASONING_MODEL_FAST, REASONING_MODEL_FALLBACK]

DB_PATH = Path(_env("DB_PATH", str(BASE_DIR / "docuvibe.db")))
UPLOAD_DIR = Path(_env("UPLOAD_DIR", str(BASE_DIR / "uploads")))
CORS_ORIGINS = [o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

SELF_CORRECTION_THRESHOLD = 0.85
MAX_AGENT_ROUNDS = 6


def validate_config() -> None:
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env and add your Groq API key."
        )
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
