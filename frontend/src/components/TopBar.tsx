"use client";

import { Brain, Eye, FileScan, Mic, Volume2 } from "lucide-react";

interface Props {
  visionModel: string;
  sttModel: string;
  reasoningModels: string[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  backendOnline: boolean | null;
}

function Badge({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs">
      {icon}
      <span className="text-white/75">{label}</span>
      <span className="font-mono text-white">{value}</span>
    </span>
  );
}

export default function TopBar({ visionModel, sttModel, reasoningModels, selectedModel, onModelChange, backendOnline }: Props) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-primary px-5 py-3 text-white shadow-md2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <FileScan className="h-5 w-5 text-white" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">DocuVibe Agent</h1>
          <p className="text-xs text-white/75">Bilingual vision and voice civic assistant</p>
        </div>
        <span
          className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            backendOnline === null
              ? "bg-white/15 text-white"
              : backendOnline
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              backendOnline === null ? "bg-slate-400" : backendOnline ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {backendOnline === null ? "Connecting" : backendOnline ? "API online" : "API offline"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge icon={<Eye className="h-3.5 w-3.5 text-white" />} label="Vision" value={visionModel} />
        <label className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs">
          <Brain className="h-3.5 w-3.5 text-white" aria-hidden />
          <span className="text-white/75">Reasoning</span>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="cursor-pointer bg-transparent font-mono text-white outline-none"
            aria-label="Reasoning model"
          >
            {reasoningModels.map((m) => (
              <option key={m} value={m} className="bg-white text-slate-900">
                {m}
              </option>
            ))}
          </select>
        </label>
        <Badge icon={<Mic className="h-3.5 w-3.5 text-white" />} label="STT" value={sttModel} />
        <Badge icon={<Volume2 className="h-3.5 w-3.5 text-white" />} label="TTS" value="browser voice" />
      </div>
    </header>
  );
}
