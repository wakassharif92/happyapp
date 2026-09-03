"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import type { FeatureRequestKind, FeatureRequestStatus } from "@/lib/types/database";
import { FEATURE_REQUEST_KIND_LABELS } from "@/lib/types/database";

// Any active company member can add/update — open, collaborative idea
// tracking, not admin-gated like Documents (matches RLS: staff_all, not
// an admin check).
export async function createFeatureRequest(input: {
  projectId: string;
  kind: FeatureRequestKind;
  title: string;
  description: string;
  sourceIssueId?: string;
}) {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .insert({
      company_id: member.companyId,
      project_id: input.projectId,
      kind: input.kind,
      title: input.title,
      description: input.description || null,
      created_by: member.name,
      source_issue_id: input.sourceIssueId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create");

  revalidatePath("/dashboard");
  return data;
}

export async function updateFeatureRequestStatus(id: string, status: FeatureRequestStatus) {
  const supabase = await createClient();
  await supabase.from("feature_requests").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}

export async function deleteFeatureRequest(id: string) {
  const supabase = await createClient();
  await supabase.from("feature_requests").delete().eq("id", id);
  revalidatePath("/dashboard");
}

// Used by the dev-side "Move to Feature/Suggestion" dropdown on an
// existing issue — creates the feature_requests row (carrying
// source_issue_id so the card shows where it came from) and moves the
// original board_issues row to 'closed' rather than deleting it, same
// audit-trail-preserving approach as every other conversion in this app.
export async function convertIssueToFeatureRequest(input: {
  issueId: string;
  projectId: string;
  kind: FeatureRequestKind;
  title: string;
  description: string;
}) {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_requests")
    .insert({
      company_id: member.companyId,
      project_id: input.projectId,
      kind: input.kind,
      title: input.title,
      description: input.description || null,
      created_by: member.name,
      source_issue_id: input.issueId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to convert");

  await supabase.from("board_issues").update({ tab: "closed" }).eq("id", input.issueId);
  await supabase.from("board_issue_activity").insert({
    company_id: member.companyId,
    issue_id: input.issueId,
    text: `Converted to ${FEATURE_REQUEST_KIND_LABELS[input.kind]}`,
    actor: member.name,
  });

  revalidatePath("/dashboard");
  return data;
}
