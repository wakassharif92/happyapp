"use client";

import { useActionState, useState } from "react";
import { createProject, type CreateProjectState } from "./actions";
import { FRAMEWORK_OPTIONS_BY_APP_TYPE } from "@/lib/projects";

export default function NewProjectPage() {
  const [appType, setAppType] = useState<"mobile" | "web">("web");
  const [state, formAction, pending] = useActionState<
    CreateProjectState,
    FormData
  >(createProject, undefined);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10">
      <h1 className="text-xl font-semibold">Add Project</h1>
      <p className="mt-1 text-sm text-slate-500">
        Every module, test case, and issue will be scoped to this project.
      </p>

      <form action={formAction} className="mt-6 flex flex-col gap-5">
        <Field label="Name">
          <input
            name="name"
            required
            className="input"
            placeholder="Storefront iOS App"
          />
        </Field>

        <Field label="Description">
          <textarea name="description" rows={2} className="input" />
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
            <select name="platform" className="input" defaultValue="android">
              <option value="android">Android</option>
              <option value="ios">iOS</option>
              <option value="both">Both</option>
            </select>
          </Field>
        )}

        <Field label="Framework">
          <select name="framework" className="input" defaultValue="">
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
            placeholder="/Users/you/code/storefront-app"
          />
          <p className="text-xs text-slate-500">
            Local path the Programming Agent will read/write.
          </p>
        </Field>

        <Field label="Requirements doc reference">
          <input
            name="requirements_doc_ref"
            className="input"
            placeholder="docs/requirements.md"
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
            placeholder={
              appType === "mobile"
                ? "http://localhost:4723"
                : "http://localhost:3000"
            }
          />
        </Field>

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create project"}
        </button>
      </form>
    </div>
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
