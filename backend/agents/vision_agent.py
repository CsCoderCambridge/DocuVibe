"""VisionReflector: self-correcting multi-pass document extraction agent."""

import base64
import io
import json
import time
from pathlib import Path
from typing import Any

import groq
from PIL import Image, ImageOps

import database as db
from config import REASONING_MODEL_FAST, REASONING_MODEL_PRIMARY, SELF_CORRECTION_THRESHOLD, UPLOAD_DIR, VISION_MODEL
from services.groq_client import chat_with_fallback, parse_json

AGENT_NAME = "VisionReflector"
MAX_SIDE = 1600

PASS1_PROMPT = """You are an expert OCR and document-understanding system for Pakistani administrative documents written in Urdu and/or English (forms, utility bills, official notices, applications, manuscripts).

Read the ENTIRE image carefully and return ONLY a JSON object with exactly these keys:
{
  "doc_type": "short label e.g. NADRA Form, Utility Bill, Official Notice, Handwritten Application",
  "raw_ocr_text": "full verbatim transcription preserving Urdu script and line breaks",
  "english_translation": "faithful English translation of the whole document",
  "urdu_summary": "2-4 sentence summary written in Urdu script explaining what this document is and what the reader must do",
  "confidence_score": 0.0-1.0 overall transcription confidence,
  "low_confidence_region": [x1, y1, x2, y2] bounding box (integers, normalized 0-1000 relative to image width/height) of the area that is hardest to read (dense, blurry or handwritten), or null if everything is clear,
  "fields": [
    {"field_key": "snake_case_key", "field_label": "Human readable label", "field_value": "value as printed or null if blank", "is_missing": true/false}
  ]
}

Rules for fields:
- Include every fillable or important field: names, CNIC numbers, father's name, addresses, phone, dates, due dates, amounts, reference/consumer numbers, signatures.
- If a field exists on the form but is blank/unfilled, set field_value to null and is_missing to true.
- Keep numbers exactly as printed (e.g. CNIC 35202-1234567-1).
Return JSON only, no commentary."""

PASS2_PROMPT = """This image is a 2x zoomed crop of a region of an Urdu/English document that was hard to read in a first pass.
Transcribe EVERY character in this crop exactly, preserving Urdu ligatures, digits and line breaks.
Return ONLY JSON: {"zoomed_text": "...", "notes": "brief note on any characters that remain uncertain"}"""

RECONCILE_PROMPT = """You are a meticulous Urdu/English OCR verification agent.
You receive (1) a first-pass extraction of a full document and (2) a focused re-transcription of the hardest-to-read region.
Reconcile them: fix OCR errors, broken Urdu ligatures, swapped or misread digits, and incomplete words. Prefer the zoomed transcription where it overlaps the hard region.

Return ONLY a JSON object with keys:
{
  "doc_type": str,
  "refined_text": "corrected full transcription",
  "english_translation": str,
  "urdu_summary": "summary in Urdu script",
  "confidence_score": 0.0-1.0 (your confidence after correction),
  "fields": [{"field_key": str, "field_label": str, "field_value": str or null, "is_missing": bool}]
}"""


def _now_ms() -> float:
    return time.perf_counter() * 1000


def _encode_image(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _load_image(image_path: Path) -> Image.Image:
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def _vision_json(prompt: str, data_url: str) -> tuple[dict[str, Any], str]:
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]
    try:
        resp, model = chat_with_fallback(
            [VISION_MODEL], messages=messages, temperature=0.1, response_format={"type": "json_object"}
        )
    except groq.BadRequestError:
        resp, model = chat_with_fallback([VISION_MODEL], messages=messages, temperature=0.1)
    return parse_json(resp.choices[0].message.content), model


def _text_json(models: list[str], system: str, user: str) -> tuple[dict[str, Any], str]:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    try:
        resp, model = chat_with_fallback(models, messages=messages, temperature=0.1, response_format={"type": "json_object"})
    except groq.BadRequestError:
        resp, model = chat_with_fallback(models, messages=messages, temperature=0.1)
    return parse_json(resp.choices[0].message.content), model


def _valid_bbox(bbox: Any) -> list[int] | None:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x1, y1, x2, y2 = (max(0, min(1000, int(float(v)))) for v in bbox)
    except (TypeError, ValueError):
        return None
    if x2 - x1 < 20 or y2 - y1 < 20:
        return None
    return [x1, y1, x2, y2]


def _clamp_confidence(value: Any) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return 0.0
    if v > 1.0:
        v = v / 100.0
    return max(0.0, min(1.0, v))


def _normalize_fields(fields: Any) -> list[dict[str, Any]]:
    if not isinstance(fields, list):
        return []
    out = []
    for f in fields:
        if not isinstance(f, dict) or not f.get("field_key"):
            continue
        key = str(f["field_key"]).strip().lower().replace(" ", "_")
        value = f.get("field_value")
        value = None if value in (None, "", "null", "N/A") else str(value).strip()
        out.append(
            {
                "field_key": key,
                "field_label": str(f.get("field_label") or key.replace("_", " ").title()),
                "field_value": value,
                "is_missing": bool(f.get("is_missing")) or value is None,
            }
        )
    return out


def crop_and_reexamine_region(image: Image.Image, bbox: list[int], doc_stem: str) -> tuple[str, str, str]:
    """Tool 1: crop the low-confidence region, upscale 2x and re-run vision. Returns (text, model, crop_path)."""
    w, h = image.size
    pad = 30
    x1 = max(0, (bbox[0] - pad) * w // 1000)
    y1 = max(0, (bbox[1] - pad) * h // 1000)
    x2 = min(w, (bbox[2] + pad) * w // 1000)
    y2 = min(h, (bbox[3] + pad) * h // 1000)
    crop = image.crop((x1, y1, x2, y2))
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    if max(crop.size) > 2000:
        crop.thumbnail((2000, 2000))
    crop_path = UPLOAD_DIR / f"{doc_stem}_crop.jpg"
    crop.save(crop_path, format="JPEG", quality=90)
    data, model = _vision_json(PASS2_PROMPT, _encode_image(crop))
    return str(data.get("zoomed_text") or ""), model, crop_path.name


def verify_and_repair_script(pass1: dict[str, Any], zoomed_text: str) -> tuple[dict[str, Any], str]:
    """Tool 2: reconcile the global and zoomed transcriptions with a reasoning model."""
    payload = json.dumps(
        {
            "first_pass": {k: pass1.get(k) for k in ("doc_type", "raw_ocr_text", "english_translation", "urdu_summary", "fields")},
            "zoomed_region_text": zoomed_text,
        },
        ensure_ascii=False,
    )
    return _text_json([REASONING_MODEL_FAST, REASONING_MODEL_PRIMARY], RECONCILE_PROMPT, payload)


def persist_document_to_sqlite(doc_data: dict[str, Any], fields: list[dict[str, Any]]) -> int:
    """Tool 3: store the verified document and its fields."""
    doc_id = db.create_document(doc_data)
    db.insert_fields(doc_id, fields)
    return doc_id


def run_vision_pipeline(image_path: Path, original_filename: str) -> dict[str, Any]:
    log_ids: list[int] = []

    def log(model: str, tool: str, tool_input: Any, summary: str, started: float) -> None:
        entry = db.log_agent_step(None, AGENT_NAME, model, tool, tool_input, summary, int(_now_ms() - started))
        log_ids.append(entry["id"])

    image = _load_image(image_path)

    # Pass 1: global scan
    t0 = _now_ms()
    pass1, model1 = _vision_json(PASS1_PROMPT, _encode_image(image))
    confidence = _clamp_confidence(pass1.get("confidence_score"))
    bbox = _valid_bbox(pass1.get("low_confidence_region"))
    fields = _normalize_fields(pass1.get("fields"))
    log(
        model1,
        "pass1_global_scan",
        {"image": image_path.name},
        f"Pass 1: {round(confidence * 100)}% conf, {len(fields)} fields, type={pass1.get('doc_type')}",
        t0,
    )

    final = {
        "doc_type": pass1.get("doc_type"),
        "refined_text": pass1.get("raw_ocr_text"),
        "english_translation": pass1.get("english_translation"),
        "urdu_summary": pass1.get("urdu_summary"),
        "confidence_score": confidence,
    }

    # Self-correction: crop + re-examine + reconcile
    if bbox and confidence < SELF_CORRECTION_THRESHOLD:
        zoomed_text = ""
        t1 = _now_ms()
        try:
            zoomed_text, model2, crop_name = crop_and_reexamine_region(image, bbox, image_path.stem)
            log(model2, "crop_and_reexamine_region", {"bbox": bbox}, f"Cropped {bbox} -> {len(zoomed_text)} chars ({crop_name})", t1)
        except Exception as err:  # noqa: BLE001
            log(VISION_MODEL, "crop_and_reexamine_region", {"bbox": bbox}, f"Failed, keeping pass 1: {err}", t1)

        if zoomed_text:
            t2 = _now_ms()
            try:
                repaired, model3 = verify_and_repair_script(pass1, zoomed_text)
                repaired_fields = _normalize_fields(repaired.get("fields"))
                final.update(
                    {
                        "doc_type": repaired.get("doc_type") or final["doc_type"],
                        "refined_text": repaired.get("refined_text") or final["refined_text"],
                        "english_translation": repaired.get("english_translation") or final["english_translation"],
                        "urdu_summary": repaired.get("urdu_summary") or final["urdu_summary"],
                        "confidence_score": max(confidence, _clamp_confidence(repaired.get("confidence_score"))),
                    }
                )
                if repaired_fields:
                    fields = repaired_fields
                log(
                    model3,
                    "verify_and_repair_script",
                    {"raw_chars": len(pass1.get("raw_ocr_text") or ""), "zoomed_chars": len(zoomed_text)},
                    f"Reconciled: {round(final['confidence_score'] * 100)}% conf, {len(fields)} fields",
                    t2,
                )
            except Exception as err:  # noqa: BLE001
                log(REASONING_MODEL_FAST, "verify_and_repair_script", None, f"Failed, keeping pass 1: {err}", t2)
    else:
        log(model1, "self_correction_check", {"confidence": confidence, "bbox": bbox}, "Confidence high enough, skipping re-examination", _now_ms())

    # Persist
    t3 = _now_ms()
    doc_id = persist_document_to_sqlite(
        {
            "filename": original_filename,
            "image_path": image_path.name,
            "raw_ocr_text": pass1.get("raw_ocr_text"),
            "low_confidence_bbox": bbox,
            **final,
        },
        fields,
    )
    log("sqlite3", "persist_document_to_sqlite", {"fields": len(fields)}, f"Saved document #{doc_id} with {len(fields)} fields", t3)
    db.attach_logs_to_document(log_ids, doc_id)

    full = db.get_document_full(doc_id)
    assert full is not None
    return full
