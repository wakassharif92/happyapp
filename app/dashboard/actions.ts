"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Category, MediaType, Severity, SourceChannel, TabKey } from "@/lib/board/types";
import type { BoardIssueActivity, BoardIssueComment } from "@/lib/types/database";

async function currentUserLabel(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? "You";
}

export async function updateIssueCategory(issueId: string, category: Category) {
  const supabase = await createClient();
  await supabase.from("board_issues").update({ category }).eq("id", issueId);
  revalidatePath("/dashboard");
}

export async function moveIssue(issueId: string, tab: TabKey) {
  const supabase = await createClient();
  const actor = await currentUserLabel();

  await supabase.from("board_issues").update({ tab }).eq("id", issueId);
  await supabase.from("board_issue_activity").insert({
    issue_id: issueId,
    text: `Moved to ${tab.replace("_", " ")}`,
    actor,
  });
  revalidatePath("/dashboard");
}

export async function addComment(
  issueId: string,
  text: string
): Promise<BoardIssueComment | null> {
  const supabase = await createClient();
  const author = await currentUserLabel();

  const { data } = await supabase
    .from("board_issue_comments")
    .insert({ issue_id: issueId, author, text })
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

export async function createIssue(input: {
  projectId: string;
  title: string;
  message: string;
  category: Category;
  sourceChannel: SourceChannel;
  severity?: Severity;
  mediaType: MediaType;
}) {
  const supabase = await createClient();
  const actor = await currentUserLabel();
  const tab: TabKey = input.sourceChannel === "User Complaint" ? "user_complaints" : "pending";

  const { data, error } = await supabase
    .from("board_issues")
    .insert({
      project_id: input.projectId,
      tab,
      title: input.title,
      message: input.message,
      sender_name: actor,
      source_channel: input.sourceChannel,
      category: input.category,
      severity: input.sourceChannel === "User Complaint" ? (input.severity ?? "Medium") : null,
      media_type: input.mediaType,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create issue");
  }

  await supabase.from("board_issue_activity").insert({
    issue_id: data.id,
    text: "Issue created",
    actor,
  });

  revalidatePath("/dashboard");
  return data;
}
