"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitReportState = { error?: string; success?: boolean } | undefined;

// REQ-116/117: public, no-login report form — this is the whole point (the
// WhatsApp Business API setup proved too heavy a barrier for routine
// reporting). Uses the admin client since there's no user session to
// attach an insert to; only ever called from this one server action, never
// exposed to the browser.
export async function submitReport(
  _prevState: SubmitReportState,
  formData: FormData
): Promise<SubmitReportState> {
  const senderName = (formData.get("sender_name") as string)?.trim();
  const rawProjectId = (formData.get("project_id") as string) || null;
  const otherProjectName = (formData.get("other_project_name") as string)?.trim() || null;
  const pageName = (formData.get("page_name") as string)?.trim() || null;
  const messageText = (formData.get("message_text") as string)?.trim();
  const image = formData.get("image") as File | null;

  if (!senderName) return { error: "Your name is required." };
  if (!messageText) return { error: "Describe the issue." };

  // "Other (not listed)" isn't a real project id — it's a signal to store
  // the typed name as a plain note instead (REQ-117's fallback; see the
  // migration comment for why this doesn't create a real `projects` row).
  const isOtherProject = rawProjectId === "__other__";
  const projectId = isOtherProject ? null : rawProjectId;

  const supabase = createAdminClient();

  // Resolve company_id from the picked project when there is one — "Other
  // (not listed)" or no selection leaves it null, same documented
  // nullable-exception as app/report/[projectId]/actions.ts's rationale
  // (migration 0015): there's nowhere to derive a company from otherwise.
  let companyId: string | null = null;
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("company_id")
      .eq("id", projectId)
      .maybeSingle();
    companyId = project?.company_id ?? null;
  }

  let imagePath: string | null = null;

  if (image && image.size > 0) {
    const ext = image.name.split(".").pop() || "jpg";
    imagePath = `web-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(imagePath, image);
    if (uploadError) return { error: uploadError.message };
  }

  const { error } = await supabase.from("team_reports").insert({
    company_id: companyId,
    source: "web",
    sender_name: senderName,
    project_id: projectId,
    other_project_name: isOtherProject ? otherProjectName : null,
    page_name: pageName,
    message_text: messageText,
    image_path: imagePath,
  });
  if (error) return { error: error.message };

  return { success: true };
}
