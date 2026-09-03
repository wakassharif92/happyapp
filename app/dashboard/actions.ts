"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import type { Category, MediaType, Severity, SourceChannel, TabKey } from "@/lib/board/types";
import type { BoardIssueActivity, BoardIssueComment } from "@/lib/types/database";

export async function updateIssueCategory(issueId: string, category: Category) {
  const supabase = await createClient();
  await supabase.from("board_issues").update({ category }).eq("id", issueId);
  revalidatePath("/dashboard");
}

// Permanent delete — every child row (comments, activity, extra images)
// cascades via its own FK, no cleanup needed here.
export async function deleteIssue(issueId: string) {
  const supabase = await createClient();
  await supabase.from("board_issues").delete().eq("id", issueId);
  revalidatePath("/dashboard");
}

export async function moveIssue(issueId: string, tab: TabKey) {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) throw new Error("No active company membership");

  await supabase.from("board_issues").update({ tab }).eq("id", issueId);
  await supabase.from("board_issue_activity").insert({
    company_id: member.companyId,
    issue_id: issueId,
    text: `Moved to ${tab.replace("_", " ")}`,
    actor: member.name,
  });
  revalidatePath("/dashboard");
}

// Swaps two issues' sort_order values (migration 0019) — the whole of
// "reordering" is just this one pair-swap; DashboardClient.tsx's
// handleReorder figures out which two ids/values to swap from whatever's
// currently adjacent on screen.
export async function reorderIssues(
  issueIdA: string,
  sortOrderA: number,
  issueIdB: string,
  sortOrderB: number
) {
  const supabase = await createClient();
  await Promise.all([
    supabase.from("board_issues").update({ sort_order: sortOrderA }).eq("id", issueIdA),
    supabase.from("board_issues").update({ sort_order: sortOrderB }).eq("id", issueIdB),
  ]);
  revalidatePath("/dashboard");
}

export async function addComment(
  issueId: string,
  text: string
): Promise<BoardIssueComment | null> {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) throw new Error("No active company membership");

  const { data } = await supabase
    .from("board_issue_comments")
    .insert({ company_id: member.companyId, issue_id: issueId, author: member.name, text })
    .select("*")
    .single();

  revalidatePath("/dashboard");
  return data;
}

export async function getIssueThread(
  issueId: string
): Promise<{ comments: BoardIssueComment[]; activity: BoardIssueActivity[] }> {
  const supabase = await createClient();
  const [{ data: comments }, { data: activity }] = await Promise.all([
    supabase
      .from("board_issue_comments")
      .select("*")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true }),
    supabase
      .from("board_issue_activity")
      .select("*")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true }),
  ]);
  return { comments: comments ?? [], activity: activity ?? [] };
}

// Extra images beyond an issue's primary media_url (migration 0022) —
// lazy-loaded by IssueDetailPanel.tsx the same way getIssueThread() is,
// resolving each private Storage path to a signed URL here (same
// pattern as app/dashboard/page.tsx's initial-load resolution).
export async function getIssueExtraMedia(issueId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_issue_media")
    .select("media_url")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return [];

  const resolved = await Promise.all(
    data.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(row.media_url, 60 * 60);
      return signed?.signedUrl ?? null;
    })
  );
  return resolved.filter((url): url is string => Boolean(url));
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  message: string;
  category: Category;
  sourceChannel: SourceChannel;
  severity?: Severity;
  mediaType: MediaType;
  // Already-uploaded whatsapp-media Storage paths (NewIssueModal.tsx
  // uploads client-side before calling in) — the first becomes this
  // issue's own media_url/media_type (the single "primary" image every
  // other code path expects: Realtime resolution, IssueCard, Vibe
  // Coding's PDF export); any beyond that go into board_issue_media
  // (migration 0022) as extra attachments.
  mediaPaths: string[];
}) {
  const supabase = await createClient();
  const member = await getCurrentMember();
  if (!member) throw new Error("No active company membership");
  const tab: TabKey = input.sourceChannel === "User Complaint" ? "user_complaints" : "pending";

  const { data, error } = await supabase
    .from("board_issues")
    .insert({
      company_id: member.companyId,
      project_id: input.projectId,
      tab,
      title: input.title,
      message: input.message,
      sender_name: member.name,
      source_channel: input.sourceChannel,
      category: input.category,
      severity: input.sourceChannel === "User Complaint" ? (input.severity ?? "Medium") : null,
      media_type: input.mediaPaths.length > 0 ? "image" : input.mediaType,
      media_url: input.mediaPaths[0] ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create issue");
  }

  await supabase.from("board_issue_activity").insert({
    company_id: member.companyId,
    issue_id: data.id,
    text: "Issue created",
    actor: member.name,
  });

  const extraImages = input.mediaPaths.slice(1);
  if (extraImages.length > 0) {
    await supabase.from("board_issue_media").insert(
      extraImages.map((media_url) => ({
        company_id: member.companyId,
        issue_id: data.id,
        media_url,
      }))
    );
  }

  revalidatePath("/dashboard");
  return data;
}
