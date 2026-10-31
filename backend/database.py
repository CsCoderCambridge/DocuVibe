import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    image_path TEXT NOT NULL,
    doc_type TEXT,
    raw_ocr_text TEXT,
    refined_text TEXT,
    english_translation TEXT,
    urdu_summary TEXT,
    confidence_score REAL DEFAULT 0.0,
    low_confidence_bbox TEXT,
    generated_draft TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extracted_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_value TEXT,
    is_missing BOOLEAN DEFAULT 0,
    confidence REAL DEFAULT 1.0,
    bbox_json TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    step_number INTEGER NOT NULL,
    task_description TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER,
    agent_name TEXT NOT NULL,
    model_used TEXT NOT NULL,
    tool_called TEXT NOT NULL,
    tool_input TEXT,
    tool_output_summary TEXT,
    execution_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fields_doc ON extracted_fields(document_id);
CREATE INDEX IF NOT EXISTS idx_actions_doc ON action_items(document_id);
CREATE INDEX IF NOT EXISTS idx_logs_doc ON agent_logs(document_id);
"""


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    data = dict(row)
    for key in ("is_missing", "is_completed"):
        if key in data:
            data[key] = bool(data[key])
    for key in ("bbox_json", "low_confidence_bbox"):
        if data.get(key):
            try:
                data[key] = json.loads(data[key])
            except (TypeError, ValueError):
                data[key] = None
    return data


def _rows(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [_row(r) for r in rows]  # type: ignore[misc]


# ---------- documents ----------

def create_document(doc: dict[str, Any]) -> int:
    bbox = doc.get("low_confidence_bbox")
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO documents
               (filename, image_path, doc_type, raw_ocr_text, refined_text, english_translation,
                urdu_summary, confidence_score, low_confidence_bbox)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                doc["filename"],
                doc["image_path"],
                doc.get("doc_type"),
                doc.get("raw_ocr_text"),
                doc.get("refined_text"),
                doc.get("english_translation"),
                doc.get("urdu_summary"),
                float(doc.get("confidence_score") or 0.0),
                json.dumps(bbox) if bbox else None,
            ),
        )
        return int(cur.lastrowid)


def get_document(doc_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        return _row(conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone())


def list_documents() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, filename, doc_type, confidence_score, created_at FROM documents ORDER BY id DESC"
        ).fetchall()
        return _rows(rows)


def save_draft(doc_id: int, draft: str) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE documents SET generated_draft = ? WHERE id = ?", (draft, doc_id))


# ---------- fields ----------

def insert_fields(doc_id: int, fields: list[dict[str, Any]]) -> None:
    rows = []
    seen: set[str] = set()
    for f in fields:
        key = str(f.get("field_key") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        value = f.get("field_value")
        value = None if value in (None, "", "null") else str(value)
        is_missing = bool(f.get("is_missing")) or value is None
        bbox = f.get("bbox")
        rows.append(
            (
                doc_id,
                key,
                str(f.get("field_label") or key.replace("_", " ").title()),
                value,
                1 if is_missing else 0,
                float(f.get("confidence") if f.get("confidence") is not None else 1.0),
                json.dumps(bbox) if bbox else None,
            )
        )
    if not rows:
        return
    with get_conn() as conn:
        conn.executemany(
            """INSERT INTO extracted_fields
               (document_id, field_key, field_label, field_value, is_missing, confidence, bbox_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )


def get_fields(doc_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return _rows(
            conn.execute("SELECT * FROM extracted_fields WHERE document_id = ? ORDER BY id", (doc_id,)).fetchall()
        )


def get_missing_fields(doc_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return _rows(
            conn.execute(
                """SELECT field_key, field_label FROM extracted_fields
                   WHERE document_id = ? AND (is_missing = 1 OR field_value IS NULL) ORDER BY id""",
                (doc_id,),
            ).fetchall()
        )


def update_field_by_key(doc_id: int, field_key: str, new_value: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cur = conn.execute(
            """UPDATE extracted_fields SET field_value = ?, is_missing = 0, updated_at = CURRENT_TIMESTAMP
               WHERE document_id = ? AND field_key = ?""",
            (new_value, doc_id, field_key),
        )
        if cur.rowcount == 0:
            return None
        return _row(
            conn.execute(
                "SELECT * FROM extracted_fields WHERE document_id = ? AND field_key = ?", (doc_id, field_key)
            ).fetchone()
        )


def add_field(doc_id: int, field_key: str, field_label: str, value: str) -> dict[str, Any]:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO extracted_fields (document_id, field_key, field_label, field_value, is_missing)
               VALUES (?, ?, ?, ?, 0)""",
            (doc_id, field_key, field_label, value),
        )
        return _row(conn.execute("SELECT * FROM extracted_fields WHERE id = ?", (cur.lastrowid,)).fetchone())  # type: ignore[return-value]


def update_field_by_id(field_id: int, new_value: str | None) -> dict[str, Any] | None:
    value = new_value.strip() if isinstance(new_value, str) else None
    value = value or None
    with get_conn() as conn:
        cur = conn.execute(
            """UPDATE extracted_fields SET field_value = ?, is_missing = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (value, 0 if value else 1, field_id),
        )
        if cur.rowcount == 0:
            return None
        return _row(conn.execute("SELECT * FROM extracted_fields WHERE id = ?", (field_id,)).fetchone())


# ---------- action items ----------

def replace_action_items(doc_id: int, steps: list[str]) -> list[dict[str, Any]]:
    clean = [s.strip() for s in steps if isinstance(s, str) and s.strip()]
    with get_conn() as conn:
        conn.execute("DELETE FROM action_items WHERE document_id = ?", (doc_id,))
        conn.executemany(
            "INSERT INTO action_items (document_id, step_number, task_description) VALUES (?, ?, ?)",
            [(doc_id, i + 1, s) for i, s in enumerate(clean)],
        )
    return get_action_items(doc_id)


def get_action_items(doc_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return _rows(
            conn.execute(
                "SELECT * FROM action_items WHERE document_id = ? ORDER BY step_number", (doc_id,)
            ).fetchall()
        )


def set_action_item_completed(item_id: int, completed: bool) -> dict[str, Any] | None:
    with get_conn() as conn:
        cur = conn.execute("UPDATE action_items SET is_completed = ? WHERE id = ?", (1 if completed else 0, item_id))
        if cur.rowcount == 0:
            return None
        return _row(conn.execute("SELECT * FROM action_items WHERE id = ?", (item_id,)).fetchone())


# ---------- agent logs ----------

def log_agent_step(
    document_id: int | None,
    agent_name: str,
    model_used: str,
    tool_called: str,
    tool_input: Any = None,
    tool_output_summary: str | None = None,
    execution_ms: int | None = None,
) -> dict[str, Any]:
    if tool_input is not None and not isinstance(tool_input, str):
        tool_input = json.dumps(tool_input, ensure_ascii=False)
    if tool_input and len(tool_input) > 2000:
        tool_input = tool_input[:2000] + "..."
    if tool_output_summary and len(tool_output_summary) > 1000:
        tool_output_summary = tool_output_summary[:1000] + "..."
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO agent_logs
               (document_id, agent_name, model_used, tool_called, tool_input, tool_output_summary, execution_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (document_id, agent_name, model_used, tool_called, tool_input, tool_output_summary, execution_ms),
        )
        return _row(conn.execute("SELECT * FROM agent_logs WHERE id = ?", (cur.lastrowid,)).fetchone())  # type: ignore[return-value]


def attach_logs_to_document(log_ids: list[int], doc_id: int) -> None:
    if not log_ids:
        return
    with get_conn() as conn:
        conn.executemany("UPDATE agent_logs SET document_id = ? WHERE id = ?", [(doc_id, i) for i in log_ids])


def get_agent_logs(doc_id: int) -> list[dict[str, Any]]:
    with get_conn() as conn:
        return _rows(conn.execute("SELECT * FROM agent_logs WHERE document_id = ? ORDER BY id", (doc_id,)).fetchall())


def get_document_full(doc_id: int) -> dict[str, Any] | None:
    doc = get_document(doc_id)
    if doc is None:
        return None
    return {
        "document": doc,
        "fields": get_fields(doc_id),
        "action_items": get_action_items(doc_id),
        "agent_logs": get_agent_logs(doc_id),
    }
