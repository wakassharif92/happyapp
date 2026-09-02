import { createClient } from "@/lib/supabase/server";
import type { CompanyMember } from "@/lib/types/database";

export type CurrentMember = {
  id: string;
  userId: string;
  companyId: string;
  companyName: string;
  name: string;
  role: string;
  isAdmin: boolean;
};

// The one place every server action/route resolves "who is this and which
// company do they belong to" — used both for company_id on inserts and for
// display-name attribution (replacing the old user.email fallback used
// throughout app/dashboard/actions.ts and app/support/[projectId]/actions.ts).
// Returns null for a signed-in user with no company yet (mid-onboarding)
// or no session at all — callers decide how to handle that.
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("company_members")
    .select("id, company_id, name, role, is_admin")
    .eq("user_id", user.id)
    .eq("invite_status", "active")
    .maybeSingle();
  if (!data) return null;

  // Separate query rather than an embedded `companies(name)` select — this
  // codebase's hand-written Database type declares `Relationships: []` on
  // every table (see lib/types/database.ts's header comment on why it uses
  // `type` aliases at all), so postgrest-js's embedded-resource inference
  // has nothing to resolve the join against and silently types the row as
  // `never`. A second plain query avoids that entirely.
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", data.company_id)
    .maybeSingle();

  return {
    id: data.id,
    userId: user.id,
    companyId: data.company_id,
    companyName: company?.name ?? "",
    name: data.name,
    role: data.role,
    isAdmin: data.is_admin,
  };
}

// Thin convenience wrapper for the common case (an insert only needs
// company_id, not the full member record) — throws rather than returning
// null, since every call site needing this is already behind an
// authenticated/company-scoped route where a missing company is a bug, not
// an expected state to handle gracefully.
export async function getCurrentCompanyId(): Promise<string> {
  const member = await getCurrentMember();
  if (!member) throw new Error("No active company membership for the current user");
  return member.companyId;
}

export type { CompanyMember };
