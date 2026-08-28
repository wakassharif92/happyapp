"use client";

import Link from "next/link";
import { signInWithGoogle } from "./actions";
import { IconGoogle } from "@/components/dashboard/icons";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white shadow-md shadow-indigo-600/20">
            H
          </div>
          <h1 className="text-xl font-semibold text-slate-900">HappyApp</h1>
          <p className="text-sm text-slate-500">Sign in to continue.</p>
        </div>

        <div className="card p-8 shadow-lg shadow-slate-900/5">
          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="btn-secondary w-full gap-2.5"
          >
            <IconGoogle className="h-4 w-4" />
            Continue with Google
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
