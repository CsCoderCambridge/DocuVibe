"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCircle2, Database, Download, FileText, ListChecks, Loader2, Pencil, Printer, X } from "lucide-react";
import type { ActionItem, Field } from "@/lib/types";

type Tab = "fields" | "checklist" | "draft";

interface Props {
  hasDocument: boolean;
  fields: Field[];
  actionItems: ActionItem[];
  draft: string | null;
  recentlyUpdated: Set<number>;
  onUpdateField: (fieldId: number, value: string | null) => Promise<void>;
  onToggleAction: (itemId: number, completed: boolean) => Promise<void>;
}

function FieldRow({ field, highlight, onSave }: { field: Field; highlight: boolean; onSave: (v: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(field.field_value ?? "");
  const [saving, setSaving] = useState(false);
  const missing = field.is_missing || !field.field_value;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value.trim() || null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={`border-b border-slate-100 align-top transition-colors ${highlight ? "bg-emerald-50" : ""}`}>
      <td className="py-2 pr-2">
        <div className="text-sm font-medium">{field.field_label}</div>
        <div className="font-mono text-[10px] text-slate-400">{field.field_key}</div>
      </td>
      <td className="py-2 pr-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              dir="auto"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
              aria-label={`Value for ${field.field_label}`}
            />
            <button type="button" onClick={save} disabled={saving} className="rounded p-1 text-emerald-600 hover:bg-emerald-50" aria-label="Save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setValue(field.field_value ?? "");
              setEditing(true);
            }}
            className="group flex w-full items-center gap-1 text-left text-sm"
            dir="auto"
          >
            {field.field_value ? <span className="break-words">{field.field_value}</span> : <span className="italic text-slate-400">needs input</span>}
            <Pencil className="ml-auto h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" aria-hidden />
          </button>
        )}
      </td>
      <td className="py-2 text-right">
        {missing ? (
          <span className="inline-block animate-pulse rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Missing</span>
        ) : (
          <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Filled</span>
        )}
      </td>
    </tr>
  );
}

export default function SqliteStatePanel({ hasDocument, fields, actionItems, draft, recentlyUpdated, onUpdateField, onToggleAction }: Props) {
  const [tab, setTab] = useState<Tab>("fields");
  const missingCount = fields.filter((f) => f.is_missing || !f.field_value).length;

  const downloadDraft = () => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([draft], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "docuvibe-application.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel overflow-hidden" aria-label="SQLite state">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Database className="h-4 w-4 text-violet-600" aria-hidden /> Live SQLite State
        </h2>
        <div className="flex gap-1" role="tablist">
          <button role="tab" aria-selected={tab === "fields"} onClick={() => setTab("fields")} className={`tab ${tab === "fields" ? "tab-active" : ""}`}>
            Fields {fields.length > 0 && <span className="ml-1 text-xs opacity-70">{fields.length - missingCount}/{fields.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === "checklist"} onClick={() => setTab("checklist")} className={`tab ${tab === "checklist" ? "tab-active" : ""}`}>
            Checklist
          </button>
          <button role="tab" aria-selected={tab === "draft"} onClick={() => setTab("draft")} className={`tab ${tab === "draft" ? "tab-active" : ""}`}>
            Draft {draft && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!hasDocument ? (
          <p className="py-6 text-center text-sm text-slate-500">Extracted fields, checklist and draft will appear here.</p>
        ) : tab === "fields" ? (
          fields.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No form fields were detected in this document.</p>
          ) : (
            <>
              {missingCount > 0 && (
                <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {missingCount} field{missingCount > 1 ? "s" : ""} missing. Tell the agent by voice or chat, or click a value to edit.
                </p>
              )}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="pb-2 font-medium">Field</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <FieldRow
                      key={`${f.id}-${f.updated_at}`}
                      field={f}
                      highlight={recentlyUpdated.has(f.id)}
                      onSave={(v) => onUpdateField(f.id, v)}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )
        ) : tab === "checklist" ? (
          actionItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              <ListChecks className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              No checklist yet. Ask the agent: &quot;What steps do I need to take?&quot;
            </div>
          ) : (
            <ul className="space-y-2">
              {actionItems.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={item.is_completed}
                      onChange={(e) => onToggleAction(item.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#0B57D0]"
                    />
                    <span dir="auto" className={`text-sm ${item.is_completed ? "text-slate-400 line-through" : ""}`}>
                      <span className="mr-1 font-semibold">{item.step_number}.</span>
                      {item.task_description}
                    </span>
                    {item.is_completed && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />}
                  </label>
                </li>
              ))}
            </ul>
          )
        ) : draft ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button
                type="button"
                onClick={downloadDraft}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
            <article id="print-area" dir="auto" className="markdown rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </article>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-slate-500">
            <FileText className="mx-auto mb-2 h-6 w-6 text-slate-300" />
            No draft yet. Ask the agent: &quot;Prepare my filled application.&quot;
          </div>
        )}
      </div>
    </section>
  );
}
