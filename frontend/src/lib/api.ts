import type {
  ActionItem,
  ChatResponse,
  ChatTurn,
  DocumentFull,
  DocumentSummary,
  Field,
  HealthResponse,
  Language,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError("Cannot reach the DocuVibe backend. Is it running on " + API_URL + "?", 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const imageUrl = (imagePath: string) => `${API_URL}/uploads/${encodeURIComponent(imagePath)}`;

export const api = {
  health: () => request<HealthResponse>("/api/health"),

  listDocuments: () => request<DocumentSummary[]>("/api/documents"),

  getDocument: (id: number) => request<DocumentFull>(`/api/documents/${id}`),

  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<DocumentFull>("/api/documents/upload", { method: "POST", body: form });
  },

  updateField: (fieldId: number, value: string | null) =>
    request<Field>(`/api/fields/${fieldId}`, { method: "PATCH", ...json({ field_value: value }) }),

  updateActionItem: (itemId: number, isCompleted: boolean) =>
    request<ActionItem>(`/api/action-items/${itemId}`, { method: "PATCH", ...json({ is_completed: isCompleted }) }),

  chat: (documentId: number, message: string, language: Language, modelOverride: string | null, history: ChatTurn[]) =>
    request<ChatResponse>("/api/agent/chat", {
      method: "POST",
      ...json({ document_id: documentId, message, language, model_override: modelOverride, history }),
    }),

  voice: (documentId: number, audio: Blob, language: Language, modelOverride: string | null, history: ChatTurn[]) => {
    const form = new FormData();
    const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", audio, `speech.${ext}`);
    form.append("document_id", String(documentId));
    form.append("language", language);
    if (modelOverride) form.append("model_override", modelOverride);
    form.append("history", JSON.stringify(history));
    return request<ChatResponse>("/api/agent/voice", { method: "POST", body: form });
  },
};
