"use client";

import { useActionState, useRef, useState } from "react";
import { MicButton } from "@/components/MicButton";
import type { SubmitTeamReportState } from "./actions";

const WHATS_WRONG_LABEL: Record<string, string> = {
  issue: "What's wrong?",
  feature: "What feature would you like?",
  suggestion: "What's your suggestion?",
};

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
  const [type, setType] = useState("issue");
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  // Appends rather than replaces — a reporter can type some, speak
  // some, type more, without losing anything already there.
  function appendTranscript(text: string) {
    const el = messageRef.current;
    if (!el) return;
    el.value = el.value.trim() ? `${el.value.trim()} ${text}` : text;
  }

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
      <Field label="Type">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="input"
        >
          <option value="issue">Issue</option>
          <option value="feature">Feature</option>
          <option value="suggestion">Suggestion</option>
        </select>
      </Field>

      <Field label="Your name">
        <input
          name="sender_name"
          required
          className="input"
          placeholder="Jane"
        />
      </Field>

      <Field label={WHATS_WRONG_LABEL[type]}>
        <div className="flex items-start gap-2">
          <textarea
            ref={messageRef}
            name="message_text"
            required
            rows={5}
            className="input flex-1"
            placeholder="What happened? Steps to reproduce, if you can… (or tap the mic to speak it)"
          />
          <MicButton onResult={appendTranscript} />
        </div>
      </Field>

      {type === "issue" && (
        <Field label="Screenshot (optional)">
          <input name="image" type="file" accept="image/*" className="input" />
        </Field>
      )}

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
