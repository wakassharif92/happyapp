"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/auth/publicOrigin";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Initiates a Google sign-in — the only sign-in method this app has
// (email/password and the account-linking migration step were both
// removed once the existing account confirmed it could sign back in via
// Google — see PROGRESS.md's Google Sign-In section). Also used from the
// invite-claim page (Part D) with an extra `invite_token` search param
// tacked onto redirectTo, which Supabase preserves through the OAuth
// round-trip back to app/auth/callback/route.ts.
export async function signInWithGoogle(redirectExtra?: string) {
  const supabase = await createClient();
  const origin = await getPublicOrigin();
  const redirectTo = `${origin}/auth/callback${redirectExtra ?? ""}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  }
  redirect(data.url);
}
