"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type OnboardingState = { error?: string } | undefined;

// First-time Google sign-in with no invite and no existing company
// (app/auth/callback/route.ts's third branch) lands here. Creates a new
// company and makes this user its first admin/owner — the same shape
// migration 0015's backfill gave every pre-existing account.
export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const companyName = (formData.get("company_name") as string)?.trim();
  const yourName = (formData.get("your_name") as string)?.trim();
  const yourRole = (formData.get("your_role") as string)?.trim();

  if (!companyName) return { error: "Company name is required." };
  if (!yourName) return { error: "Your name is required." };
  if (!yourRole) return { error: "Your role is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Admin client: creating a company and its first member is a bootstrap
  // operation that doesn't fit the normal RLS model — company_members'
  // insert policy requires an EXISTING admin of the target company, which
  // is exactly what doesn't exist yet for a brand new company, and
  // `companies` has no insert policy at all (every other write to it goes
  // through this one bootstrap path). Same reasoning as the admin client
  // used for claimConversation()/the invite-claim branch in
  // app/auth/callback/route.ts.
  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({ name: companyName })
    .select("id")
    .single();
  if (companyError || !company) {
    return { error: companyError?.message ?? "Failed to create company" };
  }

  const { error: memberError } = await admin.from("company_members").insert({
    company_id: company.id,
    user_id: user.id,
    name: yourName,
    role: yourRole,
    is_admin: true,
    invite_status: "active",
    activated_at: new Date().toISOString(),
  });
  if (memberError) return { error: memberError.message };

  redirect("/dashboard");
}
