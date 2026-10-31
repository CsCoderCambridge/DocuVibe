"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, Loader2, Mic, Pause, Play, Send, User } from "lucide-react";
import AgentTraceLog from "./AgentTraceLog";
import type { AgentLog, ChatMessage, Language } from "@/lib/types";

interface Props {
  hasDocument: boolean;
  messages: ChatMessage[];
  logs: AgentLog[];
  language: Language;
  onLanguageChange: (lang: Language) => void;
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
  recorder: {
    isRecording: boolean;
    isSupported: boolean;
    error: string | null;
    onPressStart: () => void;
    onPressEnd: () => void;
  };
  speech: {
    canSpeak: (lang: Language) => boolean;
    activeId: string | null;
    paused: boolean;
    play: (id: string, text: string, lang: Language) => void;
    pause: () => void;
    resume: () => void;
  };
}

const QUICK_PROMPTS: Record<Language, string[]> = {
  en: ["What is this document?", "What information is missing?", "What steps do I need to take?", "Prepare my filled application"],
  ur: ["یہ دستاویز کیا ہے؟", "کون سی معلومات باقی ہیں؟", "مجھے کیا اقدامات کرنے ہیں؟", "میری درخواست تیار کریں"],
};

function SpeechControl({
  state,
  onPlay,
  onPause,
  onResume,
}: {
  state: "idle" | "playing" | "paused";
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition";
  if (state === "playing") {
    return (
      <button type="button" onClick={onPause} className={`${base} border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`} aria-label="Pause voice">
        <Pause className="h-3 w-3" /> Pause
      </button>
    );
  }
  if (state === "paused") {
    return (
      <button type="button" onClick={onResume} className={`${base} border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100`} aria-label="Resume voice">
        <Play className="h-3 w-3" /> Resume
      </button>
    );
  }
  return (
    <button type="button" onClick={onPlay} className={`${base} border-slate-300 bg-white text-slate-600 hover:bg-slate-50`} aria-label="Play reply aloud">
      <Play className="h-3 w-3" /> Play
    </button>
  );
}

export default function VoiceAgentChat({ hasDocument, messages, logs, language, onLanguageChange, busy, error, onSend, recorder, speech }: Props) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy || !hasDocument) return;
    onSend(t);
    setInput("");
  };

  const disabled = !hasDocument || busy;

  return (
    <section className="panel overflow-hidden" aria-label="Voice and text agent">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Bot className="h-4 w-4 text-emerald-600" aria-hidden /> Civic Agent
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-200 p-0.5 text-xs" role="radiogroup" aria-label="Language">
            {(["ur", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                onClick={() => onLanguageChange(l)}
                className={`rounded px-2 py-1 font-medium ${language === l ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {l === "ur" ? "اردو" : "English"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AgentTraceLog logs={logs} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {!hasDocument && <p className="py-6 text-center text-sm text-slate-500">Upload a document to start talking with the agent.</p>}
        {hasDocument && messages.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">Ask anything about the document by voice or text.</p>
        )}
        {messages.map((m) => {
          const isUser = m.role === "user";
          const isUrdu = m.language === "ur";
          return (
            <div key={m.id} className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-primary" : "bg-primary"} text-white`}>
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${isUser ? "bg-primary text-white" : "bg-surface-variant text-slate-900"}`}>
                <p dir={isUrdu ? "rtl" : "ltr"} className={`whitespace-pre-wrap break-words ${isUrdu ? "font-urdu text-base leading-[2.1]" : ""}`}>
                  {m.content}
                </p>
                <div className={`mt-1 flex items-center gap-2 text-[10px] ${isUser ? "text-white/80" : "text-slate-500"}`}>
                  {m.viaVoice && (
                    <span className="inline-flex items-center gap-0.5">
                      <Mic className="h-3 w-3" /> voice
                    </span>
                  )}
                  {!isUser && speech.canSpeak(m.language) && (
                    <SpeechControl
                      state={speech.activeId !== m.id ? "idle" : speech.paused ? "paused" : "playing"}
                      onPlay={() => speech.play(m.id, m.content, m.language)}
                      onPause={speech.pause}
                      onResume={speech.resume}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Agent is thinking and calling tools...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {(error || recorder.error) && (
        <div role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error || recorder.error}
        </div>
      )}
      {language === "ur" && (
        <p className="mx-4 mb-2 text-[11px] text-slate-500">Voice replies are English-only for now. Urdu replies are shown as text.</p>
      )}

      <div className="border-t border-slate-200 p-3">
        {hasDocument && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS[language].map((q) => (
              <button
                key={q}
                type="button"
                disabled={disabled}
                onClick={() => submit(q)}
                dir="auto"
                className={`rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${language === "ur" ? "font-urdu" : ""}`}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || !recorder.isSupported}
            onPointerDown={(e) => {
              e.preventDefault();
              recorder.onPressStart();
            }}
            onPointerUp={recorder.onPressEnd}
            onPointerLeave={() => recorder.isRecording && recorder.onPressEnd()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                recorder.onPressStart();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") recorder.onPressEnd();
            }}
            className={`relative flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-full text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
              recorder.isRecording ? "scale-110 bg-red-600" : "bg-primary hover:bg-primary-dark"
            }`}
            aria-label={recorder.isRecording ? "Recording, release to send" : "Hold to talk"}
            title={recorder.isSupported ? "Hold to talk" : "Voice input not supported in this browser"}
          >
            {recorder.isRecording ? (
              <span className="flex h-6 items-end gap-0.5" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="w-1 origin-bottom animate-wave rounded bg-white" style={{ height: "100%", animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={disabled}
              dir="auto"
              placeholder={recorder.isRecording ? "Listening..." : language === "ur" ? "اپنا پیغام لکھیں..." : "Type a message or hold the mic"}
              className={`min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-50 ${language === "ur" ? "font-urdu" : ""}`}
              aria-label="Message"
            />
            <button
              type="submit"
              disabled={disabled || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-dark disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
