"""CivicFormAgent: voice/text form-filling and civic action agent with SQLite-backed tools."""

import json
import time
from typing import Any

import groq

import database as db
from config import MAX_AGENT_ROUNDS, REASONING_MODELS, STT_MODEL_FALLBACK, STT_MODEL_PRIMARY
from services.groq_client import chat_with_fallback, transcribe_with_fallback

AGENT_NAME = "CivicFormAgent"

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_missing_form_fields",
            "description": "List form fields of the current document that are still missing and must be collected from the user.",
            "parameters": {
                "type": "object",
                "properties": {"document_id": {"type": "integer"}},
                "required": ["document_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_form_field_in_sqlite",
            "description": "Save a value the user provided for a form field. Call once per field. Use the exact field_key from the fields list when it exists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "integer"},
                    "field_key": {"type": "string", "description": "snake_case key of the field"},
                    "new_value": {"type": "string"},
                    "field_label": {"type": "string", "description": "Human label, only needed when creating a new field"},
                },
                "required": ["document_id", "field_key", "new_value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_action_checklist",
            "description": "Save an ordered checklist of concrete civic steps the user must take (attestation, fee payment, office visit, documents to bring, deadlines).",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "integer"},
                    "steps": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["document_id", "steps"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compile_filled_application",
            "description": "Generate the final filled application / official response draft from all completed fields. Use when the user asks for the final form, draft, letter or printout.",
            "parameters": {
                "type": "object",
                "properties": {"document_id": {"type": "integer"}},
                "required": ["document_id"],
            },
        },
    },
]

DRAFT_PROMPT = """You draft clean, ready-to-print official documents for Pakistani citizens.
Using the document details and the filled fields, write the completed application / form summary / official response in Markdown.
Use a formal heading, a "Filled Details" table of label and value, any required body text (e.g. an application letter addressed to the right office), and a signature/date block.
Write in {language}. If a field is still missing, show it as "________". Output Markdown only."""


def _now_ms() -> float:
    return time.perf_counter() * 1000


def _system_prompt(doc: dict[str, Any], fields: list[dict[str, Any]], actions: list[dict[str, Any]], language: str) -> str:
    lang_rule = (
        "Reply ONLY in Urdu (Urdu script, not Roman Urdu)." if language == "ur" else "Reply ONLY in clear, simple English."
    )
    field_lines = [
        {
            "field_key": f["field_key"],
            "field_label": f["field_label"],
            "field_value": f["field_value"],
            "is_missing": f["is_missing"],
        }
        for f in fields
    ]
    return f"""You are DocuVibe, a friendly civic assistant helping a Pakistani citizen understand and complete an official document.
{lang_rule} Keep replies short (2-5 sentences) because they are read aloud.

Current document (id={doc['id']}):
- Type: {doc.get('doc_type')}
- English translation: {(doc.get('english_translation') or '')[:2500]}
- Urdu summary: {doc.get('urdu_summary') or ''}

Fields currently stored in SQLite:
{json.dumps(field_lines, ensure_ascii=False)}

Existing checklist: {json.dumps([a['task_description'] for a in actions], ensure_ascii=False)}

How to work:
1. When the user gives personal details (name, CNIC, phone, address, dates...), call update_form_field_in_sqlite once for EACH value, then confirm what you saved.
2. When asked what is missing or what to do next, call get_missing_form_fields and ask for the missing items conversationally, one or two at a time.
3. When the user asks what steps to take, call generate_action_checklist with concrete, ordered steps.
4. When the user asks for the final form, draft, letter or printout, call compile_filled_application.
Always use document_id={doc['id']}. Never invent personal data the user did not give."""


def _execute_tool(name: str, args: dict[str, Any], doc_id: int, language: str, state: dict[str, Any]) -> tuple[str, str]:
    """Run a tool against SQLite. Returns (result_for_model, summary_for_trace)."""
    if name == "get_missing_form_fields":
        missing = db.get_missing_fields(doc_id)
        return json.dumps({"missing_fields": missing}, ensure_ascii=False), f"{len(missing)} missing fields"

    if name == "update_form_field_in_sqlite":
        key = str(args.get("field_key") or "").strip().lower().replace(" ", "_")
        value = str(args.get("new_value") or "").strip()
        if not key or not value:
            return json.dumps({"error": "field_key and new_value are required"}), "Rejected: empty key/value"
        row = db.update_field_by_key(doc_id, key, value)
        if row is None:
            label = str(args.get("field_label") or key.replace("_", " ").title())
            row = db.add_field(doc_id, key, label, value)
            summary = f"Added new field {key} = {value}"
        else:
            summary = f"UPDATE {key} = {value}"
        state["fields_changed"] = True
        return json.dumps({"ok": True, "field": {"field_key": key, "field_value": value}}, ensure_ascii=False), summary

    if name == "generate_action_checklist":
        steps = args.get("steps") or []
        if not isinstance(steps, list) or not steps:
            return json.dumps({"error": "steps must be a non-empty list"}), "Rejected: no steps"
        items = db.replace_action_items(doc_id, [str(s) for s in steps])
        return json.dumps({"ok": True, "saved_steps": len(items)}), f"Saved {len(items)} checklist steps"

    if name == "compile_filled_application":
        doc = db.get_document(doc_id) or {}
        fields = db.get_fields(doc_id)
        payload = json.dumps(
            {
                "doc_type": doc.get("doc_type"),
                "english_translation": (doc.get("english_translation") or "")[:3000],
                "fields": [{"label": f["field_label"], "value": f["field_value"]} for f in fields],
            },
            ensure_ascii=False,
        )
        lang_name = "Urdu" if language == "ur" else "English"
        resp, model = chat_with_fallback(
            REASONING_MODELS,
            messages=[
                {"role": "system", "content": DRAFT_PROMPT.format(language=lang_name)},
                {"role": "user", "content": payload},
            ],
            temperature=0.3,
        )
        draft = (resp.choices[0].message.content or "").strip()
        db.save_draft(doc_id, draft)
        state["draft"] = draft
        filled = sum(1 for f in fields if f["field_value"])
        return (
            json.dumps({"ok": True, "draft_preview": draft[:500], "note": "Full draft is shown to the user in the Draft tab."}, ensure_ascii=False),
            f"Draft compiled with {model} ({filled}/{len(fields)} fields filled)",
        )

    return json.dumps({"error": f"Unknown tool {name}"}), f"Unknown tool {name}"


def run_civic_agent(
    document_id: int,
    message: str,
    language: str = "en",
    model_override: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    doc = db.get_document(document_id)
    if doc is None:
        raise LookupError(f"Document {document_id} not found")

    models = [model_override] + REASONING_MODELS if model_override else list(REASONING_MODELS)
    logs: list[dict[str, Any]] = []
    state: dict[str, Any] = {"fields_changed": False, "draft": None}

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt(doc, db.get_fields(document_id), db.get_action_items(document_id), language)}
    ]
    for turn in (history or [])[-10:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": str(turn["content"])[:2000]})
    messages.append({"role": "user", "content": message})

    reply_text = ""
    for _ in range(MAX_AGENT_ROUNDS):
        t0 = _now_ms()
        try:
            resp, model = chat_with_fallback(models, messages=messages, tools=TOOLS, tool_choice="auto", temperature=0.2)
        except groq.BadRequestError as err:
            # Model produced a malformed tool call; answer without tools instead of failing.
            logs.append(db.log_agent_step(document_id, AGENT_NAME, models[0], "tool_call_error", None, str(err)[:300], int(_now_ms() - t0)))
            resp, model = chat_with_fallback(models, messages=messages, temperature=0.2)
        msg = resp.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None) or []

        if not tool_calls:
            reply_text = (msg.content or "").strip()
            logs.append(db.log_agent_step(document_id, AGENT_NAME, model, "reply", None, reply_text[:200], int(_now_ms() - t0)))
            break

        messages.append(
            {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tool_calls
                ],
            }
        )
        for tc in tool_calls:
            t1 = _now_ms()
            try:
                args = json.loads(tc.function.arguments or "{}")
                if not isinstance(args, dict):
                    args = {}
            except json.JSONDecodeError:
                args = {}
            try:
                result, summary = _execute_tool(tc.function.name, args, document_id, language, state)
            except Exception as err:  # noqa: BLE001
                result, summary = json.dumps({"error": str(err)}), f"Error: {err}"
            logs.append(
                db.log_agent_step(document_id, AGENT_NAME, model, tc.function.name, args, summary, int(_now_ms() - t1))
            )
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
    else:
        reply_text = ""

    if not reply_text:
        reply_text = (
            "میں نے آپ کی درخواست پر کام کر لیا ہے۔ تفصیلات دائیں جانب دیکھیں۔"
            if language == "ur"
            else "I've processed your request. Check the panels for the updated details."
        )

    current = db.get_document(document_id) or {}
    return {
        "reply_text": reply_text,
        "audio_url": None,
        "updated_fields": db.get_fields(document_id),
        "action_items": db.get_action_items(document_id),
        "generated_draft": state["draft"] or current.get("generated_draft"),
        "agent_logs": logs,
    }


def transcribe_audio(filename: str, audio: bytes, language: str | None, document_id: int | None) -> dict[str, Any]:
    t0 = _now_ms()
    text, model = transcribe_with_fallback([STT_MODEL_PRIMARY, STT_MODEL_FALLBACK], filename, audio, language)
    log = db.log_agent_step(
        document_id, AGENT_NAME, model, "speech_to_text", {"bytes": len(audio), "language": language}, text[:200], int(_now_ms() - t0)
    )
    return {"transcript": text, "model": model, "log": log}
