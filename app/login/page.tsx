"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    authenticate,
    undefined
  );

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white shadow-sm">
            Q
          </div>
          <h1 className="text-xl font-semibold text-slate-900">QA Agent</h1>
          <p className="text-sm text-slate-500">
            {mode === "signin" ? "Sign in to continue." : "Create an account."}
          </p>
        </div>

        <div className="card p-8">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="mode" value={mode} />
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input id="email" name="email" type="email" required className="input" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="input"
              />
            </div>

            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            {state?.message && (
              <p className="text-sm text-emerald-600">{state.message}</p>
            )}

            <button type="submit" disabled={pending} className="btn-primary mt-2 w-full">
              {pending
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Sign up"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>

        {/* REQ-116: the public report form is deliberately reachable without
            signing in — this is the one visible pointer to it for anyone
            who lands here without an account. */}
        <p className="mt-6 text-center text-sm text-slate-500">
          Found a bug and don&apos;t have an account?{" "}
          <Link
            href="/team-report"
            className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
          >
            Report an issue
          </Link>
        </p>
      </div>
    </div>
  );
}
