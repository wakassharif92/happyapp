"use client";

import { useState } from "react";
import type { Severity } from "@/lib/board/types";
import { SEVERITIES } from "@/lib/board/types";
import { IconClose } from "@/components/dashboard/icons";

// Section 16: the agent's "Send case to devs" flow, opened from the top of
// the agent's chat with a customer. Email is fetched from the conversation
// (read-only — it's the identity the whole chat is keyed on, not editable
// here), reporter name, detail, and severity are set fresh for each
// ticket — severity lets devs triage the User Complaints list by urgency
// instead of first-come-first-served.
export function SendToDevsModal({
  open,
  customerEmail,
  onClose,
  onSubmit,
}: {
  open: boolean;
  customerEmail: string;
  onClose: () => void;
  onSubmit: (input: {
    reporterName: string;
    description: string;
    severity: Severity;
  }) => Promise<void>;
}) {
  const [reporterName, setReporterName] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("Medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit() {
    if (!reporterName.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        reporterName: reporterName.trim(),
        description: description.trim(),
        severity,
      });
      setReporterName("");
      setDescription("");
      setSeverity("Medium");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send case to devs");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Send case to devs</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Field label="Customer email">
            <input value={customerEmail} readOnly className="input bg-slate-50 text-slate-500" />
          </Field>
          <Field label="Reporter name">
            <input
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="Your name"
              className="input"
            />
          </Field>
          <Field label="Detail">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What's the issue?"
              className="input"
            />
          </Field>
          <Field label="Severity">
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="input"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !reporterName.trim() || !description.trim()}
            className="btn-primary mt-1"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
