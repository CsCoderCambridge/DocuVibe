import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import database as db
from agents.civic_agent import run_civic_agent, transcribe_audio
from agents.vision_agent import run_vision_pipeline
from services.groq_client import LLMUnavailableError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docuvibe")


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.validate_config()
    db.init_db()
    logger.info("DocuVibe ready. DB=%s uploads=%s", config.DB_PATH, config.UPLOAD_DIR)
    yield


app = FastAPI(title="DocuVibe Agent API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")


# ---------- schemas ----------

class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    document_id: int = Field(gt=0)
    message: str = Field(min_length=1, max_length=4000)
    language: Literal["en", "ur"] = "en"
    model_override: str | None = None
    history: list[HistoryTurn] = []


class FieldUpdate(BaseModel):
    field_value: str | None = Field(default=None, max_length=2000)


class ActionItemUpdate(BaseModel):
    is_completed: bool


# ---------- helpers ----------

def _llm_error(err: Exception) -> HTTPException:
    if isinstance(err, LLMUnavailableError):
        msg = "AI rate limit reached, please retry in a minute." if err.status_code == 429 else f"AI service error: {err}"
        return HTTPException(status_code=err.status_code, detail=msg)
    if isinstance(err, ValueError):
        return HTTPException(status_code=502, detail=f"AI returned an unreadable response: {err}")
    logger.exception("Unexpected error")
    return HTTPException(status_code=500, detail=f"Unexpected server error: {err}")


def _validate_model_override(model: str | None) -> str | None:
    if not model:
        return None
    if model not in config.REASONING_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported model. Choose one of {config.REASONING_MODELS}")
    return model


# ---------- routes ----------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "models": {
            "vision": config.VISION_MODEL,
            "stt": config.STT_MODEL_PRIMARY,
            "reasoning": config.REASONING_MODELS,
            "tts": "browser speechSynthesis",
        },
    }


@app.post("/api/documents/upload")
def upload_document(file: UploadFile = File(...)):
    ext = config.ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WEBP images are supported.")
    data = file.file.read(config.MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 10 MB.")

    stored = config.UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(data)
    try:
        return run_vision_pipeline(stored, file.filename or stored.name)
    except Exception as err:  # noqa: BLE001
        raise _llm_error(err) from err


@app.get("/api/documents")
def list_documents():
    return db.list_documents()


@app.get("/api/documents/{doc_id}")
def get_document(doc_id: int):
    full = db.get_document_full(doc_id)
    if full is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return full


@app.patch("/api/fields/{field_id}")
def update_field(field_id: int, body: FieldUpdate):
    row = db.update_field_by_id(field_id, body.field_value)
    if row is None:
        raise HTTPException(status_code=404, detail="Field not found.")
    return row


@app.patch("/api/action-items/{item_id}")
def update_action_item(item_id: int, body: ActionItemUpdate):
    row = db.set_action_item_completed(item_id, body.is_completed)
    if row is None:
        raise HTTPException(status_code=404, detail="Action item not found.")
    return row


@app.post("/api/agent/chat")
def agent_chat(body: ChatRequest):
    model = _validate_model_override(body.model_override)
    try:
        return run_civic_agent(
            body.document_id,
            body.message.strip(),
            body.language,
            model,
            [t.model_dump() for t in body.history],
        )
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except Exception as err:  # noqa: BLE001
        raise _llm_error(err) from err


@app.post("/api/agent/voice")
def agent_voice(
    audio: UploadFile = File(...),
    document_id: int = Form(..., gt=0),
    language: Literal["en", "ur"] = Form("en"),
    model_override: str | None = Form(None),
    history: str | None = Form(None),
):
    model = _validate_model_override(model_override)
    if db.get_document(document_id) is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    data = audio.file.read(config.MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Audio recording is empty.")
    if len(data) > config.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio is larger than 25 MB.")

    parsed_history: list[dict[str, str]] = []
    if history:
        try:
            raw = json.loads(history)
            parsed_history = [HistoryTurn(**t).model_dump() for t in raw if isinstance(t, dict)]
        except (ValueError, TypeError):
            parsed_history = []

    try:
        stt = transcribe_audio(audio.filename or "speech.webm", data, language, document_id)
    except Exception as err:  # noqa: BLE001
        raise _llm_error(err) from err

    transcript = stt["transcript"]
    if not transcript:
        raise HTTPException(status_code=422, detail="Could not hear any speech. Please try again.")

    try:
        result = run_civic_agent(document_id, transcript, language, model, parsed_history)
    except Exception as err:  # noqa: BLE001
        raise _llm_error(err) from err

    result["transcript"] = transcript
    result["agent_logs"] = [stt["log"], *result["agent_logs"]]
    return result
