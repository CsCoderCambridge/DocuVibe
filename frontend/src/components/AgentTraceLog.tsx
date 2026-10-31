"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Crop,
  Database,
  FileText,
  ListChecks,
  MessageSquare,
  Mic,
  ScanSearch,
  ShieldCheck,
  Volume2,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { AgentLog } from "@/lib/types";

const TOOL_META: Record<string, { icon: LucideIcon; color: string }> = {
  pass1_global_scan: { icon: ScanSearch, color: "text-sky-600 bg-sky-50 border-sky-200" },
  self_correction_check: { icon: ShieldCheck, color: "text-slate-600 bg-slate-50 border-slate-200" },
  crop_and_reexamine_region: { icon: Crop, color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200" },
  verify_and_repair_script: { icon: Wand2, color: "text-violet-600 bg-violet-50 border-violet-200" },
  persist_document_to_sqlite: { icon: Database, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  get_missing_form_fields: { icon: Database, color: "text-amber-700 bg-amber-50 border-amber-200" },
  update_form_field_in_sqlite: { icon: Database, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  generate_action_checklist: { icon: ListChecks, color: "text-teal-700 bg-teal-50 border-teal-200" },
  compile_filled_application: { icon: FileText, color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  speech_to_text: { icon: Mic, color: "text-orange-700 bg-orange-50 border-orange-200" },
  reply: { icon: MessageSquare, color: "text-slate-700 bg-white border-slate-200" },
  browser_tts: { icon: Volume2, color: "text-emerald-700 bg-white border-emerald-200" },
};

const DEFAULT_META = { icon: Activity, color: "text-slate-700 bg-white border-slate-200" };

export default function AgentTraceLog({ logs }: { logs: AgentLog[] }) {
  const [open, setOpen] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs.length, open]);

  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" aria-hidden /> Live Agent and SQLite Trace
          <span className="rounded-full bg-slate-100 px-1.5 text-xs font-normal text-slate-600">{logs.length}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto px-4 pb-3">
          {logs.length === 0 && <p className="text-xs text-slate-500">Agent steps will stream here as tools run.</p>}
          {logs.map((log) => {
            const meta = TOOL_META[log.tool_called] ?? DEFAULT_META;
            const Icon = meta.icon;
            return (
              <div key={log.id} className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${meta.color}`}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5">
                    <span className="font-mono font-semibold">[{log.model_used}]</span>
                    <span className="font-medium">{log.tool_called}</span>
                    {log.execution_ms != null && <span className="ml-auto text-[10px] opacity-70">{log.execution_ms} ms</span>}
                  </div>
                  {log.tool_output_summary && (
                    <p dir="auto" className="break-words text-slate-600">
                      {log.tool_output_summary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
