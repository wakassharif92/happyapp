"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ModuleFormState } from "./actions";

export function AddModuleForm({
  action,
}: {
  action: (
    state: ModuleFormState,
    formData: FormData
  ) => Promise<ModuleFormState>;
}) {
  const [state, formAction, pending] = useActionState<
    ModuleFormState,
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
      <p className="text-sm font-medium">Add module manually</p>
      <input name="name" required placeholder="Module name" className="input" />
      <input
        name="requirement_ref"
        placeholder="Requirement ref (e.g. section 4.2)"
        className="input"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Description"
        className="input"
      />
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
        {pending ? "Adding…" : "Add module"}
      </button>
    </form>
  );
}
