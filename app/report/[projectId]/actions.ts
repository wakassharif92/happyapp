"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitTeamReportState = { error?: string; success?: boolean } | undefined;

// Section 14/17: writes into board_issues (tab: 'pending', source_channel:
// 'Team Report') for an Issue report, or straight into feature_requests
// (kind: 'feature'|'suggestion') when the reporter picks one of those
// instead — same project-scoped public form, routed to whichever table
// actually matches what's being reported, rather than everything landing
// in the Issue Board like before this dropdown existed. Admin client: no
// user session on a public route, same pattern as app/team-report/actions.ts.
export async function submitTeamReport(
  projectId: string,
  _prevState: SubmitTeamReportState,
  formData: FormData
): Promise<SubmitTeamReportState> {
  const type = (formData.get("type") as string) || "issue";
  const senderName = (formData.get("sender_name") as string)?.trim();
  const messageText = (formData.get("message_text") as string)?.trim();
  const image = formData.get("image") as File | null;

  if (!senderName) return { error: "Your name is required." };
  if (!messageText) return { error: "Please describe it." };

  const supabase = createAdminClient();

  // No session on this public route — company_id is resolved from the
  // project itself, same reasoning as claimConversation()
  // (app/support/[projectId]/actions.ts).
  const { data: project } = await supabase
    .from("projects")
    .select("company_id")
    .eq("id", projectId)
    .single();
  if (!project) return { error: "Project not found" };

  // Same 60-char title derivation the Slack ingestion route uses
  // (app/api/slack/events/route.ts), kept consistent across every
  // channel that creates a title from free-text.
  const title =
    messageText.length > 60 ? `${messageText.slice(0, 60)}…` : messageText;

  if (type === "feature" || type === "suggestion") {
    const { error } = await supabase.from("feature_requests").insert({
      company_id: project.company_id,
      project_id: projectId,
      kind: type,
      title,
      description: messageText,
      created_by: senderName,
    });
    if (error) return { error: error.message };
    return { success: true };
  }

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

  const { data: issue, error } = await supabase
    .from("board_issues")
    .insert({
      company_id: project.company_id,
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
    company_id: project.company_id,
    issue_id: issue.id,
    text: "Reported via Team Report form",
    actor: senderName,
  });

  return { success: true };
}
