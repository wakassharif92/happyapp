"use client";

import { signInWithGoogle } from "@/app/login/actions";
import { IconGoogle } from "@/components/dashboard/icons";

export function JoinButton({ token }: { token: string }) {
  return (
    <button
      type="button"
      onClick={() => signInWithGoogle(`?invite_token=${encodeURIComponent(token)}`)}
      className="btn-secondary w-full gap-2.5"
    >
      <IconGoogle className="h-4 w-4" />
      Continue with Google
    </button>
  );
}
