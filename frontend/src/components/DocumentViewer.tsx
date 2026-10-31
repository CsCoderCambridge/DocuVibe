"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileImage, History, Loader2, Sparkles, Upload } from "lucide-react";
import { imageUrl } from "@/lib/api";
import type { DocumentRecord, DocumentSummary } from "@/lib/types";

const DEMO_SAMPLES = [
  { label: "Urdu Handwritten Application", src: "/samples/sample1.jpg" },
  { label: "Utility / Civic Form", src: "/samples/sample2.jpg" },
];

type TextTab = "refined" | "english" | "urdu";

interface Props {
  document: DocumentRecord | null;
  history: DocumentSummary[];
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onSelectHistory: (id: number) => void;
}

export default function DocumentViewer({ document, history, uploading, error, onUpload, onSelectHistory }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<TextTab>("refined");
  const [samples, setSamples] = useState<typeof DEMO_SAMPLES>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DEMO_SAMPLES.map((s) =>
        fetch(s.src, { method: "HEAD" })
          .then((r) => (r.ok && (r.headers.get("content-type") || "").startsWith("image") ? s : null))
          .catch(() => null),
      ),
    ).then((found) => {
      if (!cancelled) setSamples(found.filter((s): s is (typeof DEMO_SAMPLES)[number] => s !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onUpload(file);
  };

  const loadSample = async (src: string) => {
    const res = await fetch(src);
    const blob = await res.blob();
    onUpload(new File([blob], src.split("/").pop() || "sample.jpg", { type: blob.type || "image/jpeg" }));
  };

  const bbox = document?.low_confidence_bbox;
  const textByTab: Record<TextTab, string | null | undefined> = {
    refined: document?.refined_text,
    english: document?.english_translation,
    urdu: document?.urdu_summary,
  };

  return (
    <section className="panel overflow-hidden" aria-label="Document viewer">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileImage className="h-4 w-4 text-sky-600" aria-hidden /> Document and Vision Passes
        </h2>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          aria-expanded={showHistory}
        >
          <History className="h-3.5 w-3.5" /> History ({history.length})
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {showHistory && (
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {history.length === 0 && <li className="px-3 py-2 text-slate-500">No documents yet.</li>}
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectHistory(h.id);
                    setShowHistory(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 ${
                    document?.id === h.id ? "bg-sky-50" : ""
                  }`}
                >
                  <span className="truncate">
                    #{h.id} {h.doc_type || h.filename}
                  </span>
                  <span className="ml-2 shrink-0 text-xs text-slate-500">{Math.round(h.confidence_score * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!uploading) handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition ${
            dragOver ? "border-sky-500 bg-sky-50" : "border-slate-300"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-sky-600" aria-hidden />
              <p className="text-sm font-medium">Running multi-pass vision agent...</p>
              <p className="text-xs text-slate-500">Global scan, crop and re-examine, script repair, SQLite save</p>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-slate-400" aria-hidden />
              <p className="text-sm">
                Drag an Urdu/English form, bill or notice here, or{" "}
                <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-sky-600 underline">
                  browse
                </button>
              </p>
              <p className="text-xs text-slate-500">JPG, PNG or WEBP up to 10 MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {samples.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <button
                key={s.src}
                type="button"
                disabled={uploading}
                onClick={() => loadSample(s.src)}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" /> {s.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {document ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">{document.doc_type || "Document"}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  document.confidence_score >= 0.85
                    ? "bg-emerald-100 text-emerald-700"
                    : document.confidence_score >= 0.6
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {Math.round(document.confidence_score * 100)}% confidence
              </span>
              {bbox && <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-fuchsia-700">Pass 2 region [{bbox.join(", ")}]</span>}
            </div>

            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(document.image_path)} alt={document.filename} className="block h-auto w-full" />
              {bbox && (
                <div
                  className="pointer-events-none absolute border-2 border-fuchsia-500 bg-fuchsia-500/10"
                  style={{
                    left: `${bbox[0] / 10}%`,
                    top: `${bbox[1] / 10}%`,
                    width: `${(bbox[2] - bbox[0]) / 10}%`,
                    height: `${(bbox[3] - bbox[1]) / 10}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-fuchsia-600 px-1 text-[10px] text-white">Pass 2 zoom</span>
                </div>
              )}
            </div>

            <div className="flex gap-1" role="tablist">
              {(
                [
                  ["refined", "Refined Text"],
                  ["english", "English Translation"],
                  ["urdu", "Urdu Summary"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`tab ${tab === key ? "tab-active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              dir="auto"
              className={`whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm ${tab !== "english" ? "urdu text-base" : ""}`}
            >
              {textByTab[tab] || <span className="text-slate-400">Nothing extracted for this view.</span>}
            </div>
          </>
        ) : (
          !uploading && (
            <p className="py-6 text-center text-sm text-slate-500">Upload a document to see the vision agent at work.</p>
          )
        )}
      </div>
    </section>
  );
}
