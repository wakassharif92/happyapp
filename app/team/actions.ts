"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";

// Part D: admin-only team management. All three actions re-check
// member.isAdmin server-side (not just hiding the buttons in the UI) —
// RLS's admin_manage_members/admin_update_members policies (migration
// 0014) would reject a non-admin's write anyway, but failing fast here
// gives a clearer error than a raw RLS-denied Postgres error.

export type CreateInviteResult =
  | { ok: true; memberId: string; token: string }
  | { ok: false; error: string };

// No email is ever sent — the admin copies the resulting /invite/[token]
// link and shares it themselves (WhatsApp, Slack, whatever). Same token
// for the life of the invite; expireInvite/renewInvite below only ever
// touch invite_expires_at, never invite_token — "link same hoga sirf
// renew hojayga."
export async function createTeamInvite(input: {
  name: string;
  role: string;
  isAdmin: boolean;
}): Promise<CreateInviteResult> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };
  if (!member.isAdmin) return { ok: false, error: "Only admins can add team members" };
  if (!input.name.trim()) return { ok: false, error: "Name is required" };
  if (!input.role.trim()) return { ok: false, error: "Role is required" };

  const supabase = await createClient();
  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from("company_members")
    .insert({
      company_id: member.companyId,
      name: input.name.trim(),
      role: input.role.trim(),
      is_admin: input.isAdmin,
      invite_token: token,
      invite_status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create invite" };

  revalidatePath("/team");
  return { ok: true, memberId: data.id, token };
}

// "Expire now" — sets invite_expires_at to the current time, which fails
// app/auth/callback/route.ts's claim check from that point on. Doesn't
// touch invite_status: only the callback route ever flips that to
// 'active', on an actual claim.
export async function expireInvite(
  memberId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };
  if (!member.isAdmin) return { ok: false, error: "Only admins can manage invites" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_members")
    .update({ invite_expires_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("company_id", member.companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}

// "Renew" — same token, new expiry (or null for "never expires").
export async function renewInvite(
  memberId: string,
  expiresAt: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: "Not signed in" };
  if (!member.isAdmin) return { ok: false, error: "Only admins can manage invites" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("company_members")
    .update({ invite_expires_at: expiresAt })
    .eq("id", memberId)
    .eq("company_id", member.companyId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/team");
  return { ok: true };
}
