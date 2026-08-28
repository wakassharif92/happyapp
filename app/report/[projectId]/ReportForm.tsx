"use client";

import { useActionState } from "react";
import type { SubmitTeamReportState } from "./actions";

export function ReportForm({
  action,
}: {
  action: (
    state: SubmitTeamReportState,
    formData: FormData
  ) => Promise<SubmitTeamReportState>;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitTeamReportState,
    FormData
  >(action, undefined);

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

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

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
