"use client";

import { useActionState, useState } from "react";
import type { SubmitReportState } from "./actions";

const OTHER_PROJECT_VALUE = "__other__";

export function TeamReportForm({
  projects,
  action,
}: {
  projects: { id: string; name: string }[];
  action: (
    state: SubmitReportState,
    formData: FormData
  ) => Promise<SubmitReportState>;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitReportState,
    FormData
  >(action, undefined);
  const [showOtherProject, setShowOtherProject] = useState(false);

  if (state?.success) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-medium text-slate-900">Thanks — got it!</p>
        <p className="mt-1 text-sm text-slate-500">
          Your report has been sent to the team.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-secondary mt-4"
        >
          Report another issue
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Your name">
        <input
          name="sender_name"
          required
          className="input"
          placeholder="Jane"
        />
      </Field>

      <Field label="Project">
        <select
          name="project_id"
          className="input"
          defaultValue=""
          onChange={(e) => setShowOtherProject(e.target.value === OTHER_PROJECT_VALUE)}
        >
          <option value="">Not sure / general</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={OTHER_PROJECT_VALUE}>Other (not listed)…</option>
        </select>
      </Field>

      {showOtherProject && (
        <Field label="Project name">
          <input
            name="other_project_name"
            className="input"
            placeholder="What's it called?"
          />
        </Field>
      )}

      <Field label="Page / screen (optional)">
        <input
          name="page_name"
          className="input"
          placeholder="e.g. Settings, Checkout, Home feed"
        />
      </Field>

      <Field label="What's wrong?">
        <textarea
          name="message_text"
          required
          rows={5}
          className="input"
          placeholder="What happened? Steps to reproduce, if you can…"
        />
      </Field>

      <Field label="Screenshot (optional)">
        <input name="image" type="file" accept="image/*" className="input" />
      </Field>

      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send report"}
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
