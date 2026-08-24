"use client";

import { useActionState, useRef, useEffect } from "react";
import type { TestCaseFormState } from "./actions";

export function AddTestCaseForm({
  action,
}: {
  action: (
    state: TestCaseFormState,
    formData: FormData
  ) => Promise<TestCaseFormState>;
}) {
  const [state, formAction, pending] = useActionState<
    TestCaseFormState,
    FormData
  >(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 card p-4"
    >
      <p className="text-sm font-medium">Add test case manually</p>
      <input name="title" required placeholder="Title" className="input" />
      <textarea
        name="scenario"
        required
        rows={3}
        placeholder="Scenario — plain-language steps the agent will follow"
        className="input"
      />
      <select name="priority" defaultValue="medium" className="input">
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add test case"}
      </button>
    </form>
  );
}
