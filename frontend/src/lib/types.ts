export type Language = "en" | "ur";

export type BBox = [number, number, number, number];

export interface DocumentRecord {
  id: number;
  filename: string;
  image_path: string;
  doc_type: string | null;
  raw_ocr_text: string | null;
  refined_text: string | null;
  english_translation: string | null;
  urdu_summary: string | null;
  confidence_score: number;
  low_confidence_bbox: BBox | null;
  generated_draft: string | null;
  created_at: string;
}

export interface DocumentSummary {
  id: number;
  filename: string;
  doc_type: string | null;
  confidence_score: number;
  created_at: string;
}

export interface Field {
  id: number;
  document_id: number;
  field_key: string;
  field_label: string;
  field_value: string | null;
  is_missing: boolean;
  confidence: number;
  bbox_json: BBox | null;
  updated_at: string;
}

export interface ActionItem {
  id: number;
  document_id: number;
  step_number: number;
  task_description: string;
  is_completed: boolean;
}

export interface AgentLog {
  id: number;
  document_id: number | null;
  agent_name: string;
  model_used: string;
  tool_called: string;
  tool_input: string | null;
  tool_output_summary: string | null;
  execution_ms: number | null;
  created_at: string;
}

export interface DocumentFull {
  document: DocumentRecord;
  fields: Field[];
  action_items: ActionItem[];
  agent_logs: AgentLog[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage extends ChatTurn {
  id: string;
  language: Language;
  viaVoice?: boolean;
}

export interface ChatResponse {
  reply_text: string;
  audio_url: string | null;
  updated_fields: Field[];
  action_items: ActionItem[];
  generated_draft: string | null;
  agent_logs: AgentLog[];
  transcript?: string;
}

export interface HealthResponse {
  status: string;
  models: { vision: string; stt: string; reasoning: string[]; tts: string };
}
