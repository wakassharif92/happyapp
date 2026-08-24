"use client";

import { useActionState, useState } from "react";
import type { Project } from "@/lib/types/database";
import { FRAMEWORK_OPTIONS_BY_APP_TYPE } from "@/lib/projects";
import type { UpdateProjectState } from "./actions";

export function SettingsForm({
  project,
  action,
}: {
  project: Project;
  action: (
    state: UpdateProjectState,
    formData: FormData
  ) => Promise<UpdateProjectState>;
}) {
  const [appType, setAppType] = useState<"mobile" | "web">(project.app_type);
  const [state, formAction, pending] = useActionState<
    UpdateProjectState,
    FormData
  >(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={project.name}
          className="input"
        />
      </Field>

      <Field label="Description">
        <textarea
          name="description"
          rows={2}
          defaultValue={project.description ?? ""}
          className="input"
        />
      </Field>

      <Field label="App type">
        <div className="flex gap-3">
          {(["web", "mobile"] as const).map((type) => (
            <label
              key={type}
              className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm capitalize ${
                appType === type
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="app_type"
                value={type}
                checked={appType === type}
                onChange={() => setAppType(type)}
                className="hidden"
              />
              {type}
            </label>
          ))}
        </div>
      </Field>

      {appType === "mobile" && (
        <Field label="Platform">
          <select
            name="platform"
            className="input"
            defaultValue={project.platform ?? "android"}
          >
            <option value="android">Android</option>
            <option value="ios">iOS</option>
            <option value="both">Both</option>
          </select>
        </Field>
      )}

      <Field label="Framework">
        <select
          name="framework"
          className="input"
          defaultValue={project.framework ?? ""}
        >
          <option value="" disabled>
            Select a framework…
          </option>
          {FRAMEWORK_OPTIONS_BY_APP_TYPE[appType].map((fw) => (
            <option key={fw} value={fw}>
              {fw}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Codebase path">
        <input
          name="codebase_path"
          className="input"
          defaultValue={project.codebase_path ?? ""}
        />
      </Field>

      <Field label="Requirements doc reference">
        <input
          name="requirements_doc_ref"
          className="input"
          defaultValue={project.requirements_doc_ref ?? ""}
        />
      </Field>

      <Field
        label={
          appType === "mobile"
            ? "Appium bridge URL"
            : "Base URL Playwright should open"
        }
      >
        <input
          name="automation_target"
          className="input"
          defaultValue={project.automation_target ?? ""}
        />
      </Field>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
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
