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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">
      {icon}
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-100">{value}</span>
    </span>
  );
}

export default function TopBar({ visionModel, sttModel, reasoningModels, selectedModel, onModelChange, backendOnline }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white">
      <div className="flex items-center gap-2">
        <FileScan className="h-6 w-6 text-emerald-400" aria-hidden />
        <div>
          <h1 className="text-lg font-bold leading-tight">DocuVibe Agent</h1>
          <p className="text-xs text-slate-400">Bilingual vision and voice civic assistant</p>
        </div>
        <span
          className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            backendOnline === null
              ? "bg-slate-700 text-slate-300"
              : backendOnline
                ? "bg-emerald-900 text-emerald-300"
                : "bg-red-900 text-red-300"
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
        <Badge icon={<Eye className="h-3.5 w-3.5 text-sky-400" />} label="Vision" value={visionModel} />
        <label className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs">
          <Brain className="h-3.5 w-3.5 text-violet-400" aria-hidden />
          <span className="text-slate-400">Reasoning</span>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="cursor-pointer bg-transparent font-mono text-slate-100 outline-none"
            aria-label="Reasoning model"
          >
            {reasoningModels.map((m) => (
              <option key={m} value={m} className="bg-slate-800">
                {m}
              </option>
            ))}
          </select>
        </label>
        <Badge icon={<Mic className="h-3.5 w-3.5 text-amber-400" />} label="STT" value={sttModel} />
        <Badge icon={<Volume2 className="h-3.5 w-3.5 text-emerald-400" />} label="TTS" value="browser voice" />
      </div>
    </header>
  );
}
