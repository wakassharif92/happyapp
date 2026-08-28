"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitTeamReportState = { error?: string; success?: boolean } | undefined;

// Section 14: writes directly into board_issues (tab: 'pending',
// source_channel: 'Team Report') rather than the legacy team_reports
// table — the whole point of this project-scoped link is that
// submissions land on that project's Issue Board like every other intake
// channel (Slack, staff-created). Admin client: no user session on a
// public route, same pattern as app/team-report/actions.ts.
export async function submitTeamReport(
  projectId: string,
  _prevState: SubmitTeamReportState,
  formData: FormData
): Promise<SubmitTeamReportState> {
  const senderName = (formData.get("sender_name") as string)?.trim();
  const messageText = (formData.get("message_text") as string)?.trim();
  const image = formData.get("image") as File | null;

  if (!senderName) return { error: "Your name is required." };
  if (!messageText) return { error: "Describe the issue." };

  const supabase = createAdminClient();
  let mediaPath: string | null = null;
  let mediaType: "image" | "none" = "none";

  if (image && image.size > 0) {
    const ext = image.name.split(".").pop() || "jpg";
    mediaPath = `report-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(mediaPath, image, { contentType: image.type });
    if (uploadError) return { error: uploadError.message };
    mediaType = "image";
  }

  // Same 60-char title derivation the Slack ingestion route uses
  // (app/api/slack/events/route.ts), kept consistent across every
  // channel that creates board_issues from free-text.
  const title =
    messageText.length > 60 ? `${messageText.slice(0, 60)}…` : messageText;

  const { data: issue, error } = await supabase
    .from("board_issues")
    .insert({
      project_id: projectId,
      tab: "pending",
      title,
      message: messageText,
      sender_name: senderName,
      source_channel: "Team Report",
      category: "Other",
      media_url: mediaPath,
      media_type: mediaType,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("board_issue_activity").insert({
    issue_id: issue.id,
    text: "Reported via Team Report form",
    actor: senderName,
  });

  return { success: true };
}
