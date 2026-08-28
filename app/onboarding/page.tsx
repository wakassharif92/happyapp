"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";

// Reached from app/auth/callback/route.ts's third branch: a Google
// identity with no invite and no existing company_members row —
// genuinely the first person from their company to sign in.
export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    undefined
  );

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white shadow-md shadow-indigo-600/20">
            H
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Set up your company</h1>
          <p className="text-sm text-slate-500">
            You&apos;ll be able to invite your team once this is done.
          </p>
        </div>

        <div className="card p-8 shadow-lg shadow-slate-900/5">
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="company_name" className="text-sm font-medium text-slate-700">
                Company name
              </label>
              <input id="company_name" name="company_name" required className="input" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="your_name" className="text-sm font-medium text-slate-700">
                Your name
              </label>
              <input id="your_name" name="your_name" required className="input" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="your_role" className="text-sm font-medium text-slate-700">
                Your role
              </label>
              <input
                id="your_role"
                name="your_role"
                required
                placeholder="Founder, Engineering Lead, …"
                className="input"
              />
            </div>

            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

            <button type="submit" disabled={pending} className="btn-primary mt-2 w-full">
              {pending ? "Setting up…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
