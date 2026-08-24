"use client";

import { useActionState } from "react";
import type { ReportIssueState } from "./actions";

export function ReportForm({
  modules,
  action,
}: {
  modules: { id: string; name: string }[];
  action: (
    state: ReportIssueState,
    formData: FormData
  ) => Promise<ReportIssueState>;
}) {
  const [state, formAction, pending] = useActionState<
    ReportIssueState,
    FormData
  >(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Module">
        <select name="module_id" required className="input" defaultValue="">
          <option value="" disabled>
            Select a module…
          </option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input
          name="title"
          required
          className="input"
          placeholder="Badge count doesn't update after marking notification read"
        />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={5}
          className="input"
          placeholder="What happened? Steps to reproduce, expected vs actual behavior…"
        />
      </Field>

      <Field label="Screenshot (optional)">
        <input name="screenshot" type="file" accept="image/*" className="input" />
      </Field>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit report"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
