"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "@/components/TopBar";
import DocumentViewer from "@/components/DocumentViewer";
import SqliteStatePanel from "@/components/SqliteStatePanel";
import VoiceAgentChat from "@/components/VoiceAgentChat";
import { useRecorder } from "@/hooks/useRecorder";
import { useSpeech } from "@/hooks/useSpeech";
import { api, ApiError } from "@/lib/api";
import type {
  ActionItem,
  AgentLog,
  ChatMessage,
  ChatResponse,
  DocumentFull,
  DocumentRecord,
  DocumentSummary,
  Field,
  Language,
} from "@/lib/types";

const DEFAULT_MODELS = {
  vision: "qwen/qwen3.8-27b",
  stt: "whisper-large-v3-turbo",
  reasoning: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
};

const errorMessage = (err: unknown) => (err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong.");
const newId = () => Math.random().toString(36).slice(2);

export default function HomePage() {
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS.reasoning[0]);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [history, setHistory] = useState<DocumentSummary[]>([]);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<number>>(new Set());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [language, setLanguage] = useState<Language>("ur");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const recorder = useRecorder();
  const speech = useSpeech();
  const pressedRef = useRef(false);
  const localLogId = useRef(-1);
  const fieldsRef = useRef<Field[]>([]);
  fieldsRef.current = fields;

  const refreshHistory = useCallback(() => {
    api.listDocuments().then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .health()
      .then((h) => {
        setBackendOnline(true);
        setModels({ vision: h.models.vision, stt: h.models.stt, reasoning: h.models.reasoning });
        setSelectedModel(h.models.reasoning[0]);
      })
      .catch(() => setBackendOnline(false));
    refreshHistory();
  }, [refreshHistory]);

  const loadFull = useCallback((full: DocumentFull) => {
    setDocument(full.document);
    setFields(full.fields);
    setActionItems(full.action_items);
    setLogs(full.agent_logs);
    setDraft(full.document.generated_draft);
    setMessages([]);
    setChatError(null);
    setRecentlyUpdated(new Set());
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setUploadError("Please upload a JPG, PNG or WEBP image.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError("Image is larger than 10 MB.");
        return;
      }
      setUploading(true);
      setUploadError(null);
      speech.stop();
      try {
        const full = await api.uploadDocument(file);
        loadFull(full);
        setBackendOnline(true);
        refreshHistory();
        const summary = language === "ur" ? full.document.urdu_summary : full.document.english_translation;
        if (summary) {
          const intro =
            language === "ur"
              ? `${summary}`
              : `This looks like a ${full.document.doc_type || "document"}. Ask me what's missing, what steps to take, or to prepare your application.`;
          setMessages([{ id: newId(), role: "assistant", content: intro, language }]);
        }
      } catch (err) {
        setUploadError(errorMessage(err));
        if (err instanceof ApiError && err.status === 0) setBackendOnline(false);
      } finally {
        setUploading(false);
      }
    },
    [language, loadFull, refreshHistory, speech],
  );

  const handleSelectHistory = useCallback(
    async (id: number) => {
      setUploadError(null);
      speech.stop();
      try {
        loadFull(await api.getDocument(id));
      } catch (err) {
        setUploadError(errorMessage(err));
      }
    },
    [loadFull, speech],
  );

  const applyAgentResponse = useCallback(
    (res: ChatResponse, replyLanguage: Language) => {
      const before = new Map(fieldsRef.current.map((f) => [f.id, f.field_value]));
      const changed = new Set(res.updated_fields.filter((f) => before.get(f.id) !== f.field_value).map((f) => f.id));
      setFields(res.updated_fields);
      setActionItems(res.action_items);
      if (res.generated_draft) setDraft(res.generated_draft);
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: res.reply_text, language: replyLanguage }]);

      const newLogs = [...res.agent_logs];
      if (speech.speak(res.reply_text, replyLanguage)) {
        newLogs.push({
          id: localLogId.current--,
          document_id: document?.id ?? null,
          agent_name: "Browser",
          model_used: "speechSynthesis",
          tool_called: "browser_tts",
          tool_input: null,
          tool_output_summary: `Speaking reply in ${replyLanguage === "ur" ? "Urdu" : "English"}`,
          execution_ms: null,
          created_at: new Date().toISOString(),
        });
      }
      setLogs((prev) => [...prev, ...newLogs]);

      if (changed.size > 0) {
        setRecentlyUpdated(changed);
        setTimeout(() => setRecentlyUpdated(new Set()), 3000);
      }
    },
    [document?.id, speech],
  );

  const chatHistory = useCallback(
    () => messages.slice(-10).map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!document) return;
      const lang = language;
      setChatError(null);
      setChatBusy(true);
      speech.stop();
      const historyTurns = chatHistory();
      setMessages((prev) => [...prev, { id: newId(), role: "user", content: text, language: lang }]);
      try {
        const res = await api.chat(document.id, text, lang, selectedModel, historyTurns);
        applyAgentResponse(res, lang);
      } catch (err) {
        setChatError(errorMessage(err));
      } finally {
        setChatBusy(false);
      }
    },
    [applyAgentResponse, chatHistory, document, language, selectedModel, speech],
  );

  const sendVoice = useCallback(
    async (blob: Blob) => {
      if (!document) return;
      const lang = language;
      setChatError(null);
      setChatBusy(true);
      try {
        const res = await api.voice(document.id, blob, lang, selectedModel, chatHistory());
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: "user", content: res.transcript || "(voice message)", language: lang, viaVoice: true },
        ]);
        applyAgentResponse(res, lang);
      } catch (err) {
        setChatError(errorMessage(err));
      } finally {
        setChatBusy(false);
      }
    },
    [applyAgentResponse, chatHistory, document, language, selectedModel],
  );

  const handlePressStart = useCallback(async () => {
    if (!document || chatBusy || recorder.isRecording) return;
    pressedRef.current = true;
    speech.stop();
    const started = await recorder.start();
    if (started && !pressedRef.current) {
      // Button was released while the mic permission prompt was open.
      const blob = await recorder.stop();
      if (blob) sendVoice(blob);
    }
  }, [chatBusy, document, recorder, sendVoice, speech]);

  const handlePressEnd = useCallback(async () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    const blob = await recorder.stop();
    if (blob) sendVoice(blob);
  }, [recorder, sendVoice]);

  const handleUpdateField = useCallback(async (fieldId: number, value: string | null) => {
    try {
      const updated = await api.updateField(fieldId, value);
      setFields((prev) => prev.map((f) => (f.id === fieldId ? updated : f)));
      setRecentlyUpdated(new Set([fieldId]));
      setTimeout(() => setRecentlyUpdated(new Set()), 2000);
    } catch (err) {
      setChatError(errorMessage(err));
      throw err;
    }
  }, []);

  const handleToggleAction = useCallback(async (itemId: number, completed: boolean) => {
    setActionItems((prev) => prev.map((a) => (a.id === itemId ? { ...a, is_completed: completed } : a)));
    try {
      const updated = await api.updateActionItem(itemId, completed);
      setActionItems((prev) => prev.map((a) => (a.id === itemId ? updated : a)));
    } catch (err) {
      setActionItems((prev) => prev.map((a) => (a.id === itemId ? { ...a, is_completed: !completed } : a)));
      setChatError(errorMessage(err));
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <TopBar
        visionModel={models.vision}
        sttModel={models.stt}
        reasoningModels={models.reasoning}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        backendOnline={backendOnline}
      />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-2 lg:grid-cols-[35fr_35fr_30fr]">
        <div className="flex min-h-[28rem] flex-col lg:min-h-0">
          <DocumentViewer
            document={document}
            history={history}
            uploading={uploading}
            error={uploadError}
            onUpload={handleUpload}
            onSelectHistory={handleSelectHistory}
          />
        </div>
        <div className="flex min-h-[28rem] flex-col lg:min-h-0">
          <SqliteStatePanel
            hasDocument={!!document}
            fields={fields}
            actionItems={actionItems}
            draft={draft}
            recentlyUpdated={recentlyUpdated}
            onUpdateField={handleUpdateField}
            onToggleAction={handleToggleAction}
          />
        </div>
        <div className="flex min-h-[36rem] flex-col md:col-span-2 lg:col-span-1 lg:min-h-0">
          <VoiceAgentChat
            hasDocument={!!document}
            messages={messages}
            logs={logs}
            language={language}
            onLanguageChange={setLanguage}
            busy={chatBusy}
            error={chatError}
            onSend={handleSend}
            recorder={{
              isRecording: recorder.isRecording,
              isSupported: recorder.isSupported,
              error: recorder.error,
              onPressStart: handlePressStart,
              onPressEnd: handlePressEnd,
            }}
            speech={{
              isSupported: speech.isSupported,
              muted: speech.muted,
              speaking: speech.speaking,
              hasUrduVoice: speech.hasUrduVoice,
              toggleMute: () => {
                if (!speech.muted) speech.stop();
                speech.setMuted(!speech.muted);
              },
              replay: (text, lang) => speech.speak(text, lang, true),
            }}
          />
        </div>
      </main>
    </div>
  );
}
