"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company";

export type ReportIssueState = { error?: string } | undefined;

// REQ-020: manual issue report — no AI, just a plain insert. Screenshots go
// to the private `evidence` Storage bucket; we store the object path (not a
// public URL) and generate signed URLs when rendering the issue detail view.
export async function reportIssue(
  projectId: string,
  _prevState: ReportIssueState,
  formData: FormData
): Promise<ReportIssueState> {
  const moduleId = formData.get("module_id") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string) || null;
  const screenshot = formData.get("screenshot") as File | null;

  if (!moduleId) return { error: "Select a module." };
  if (!title) return { error: "Title is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const issueId = crypto.randomUUID();
  const evidenceUrls: string[] = [];

  if (screenshot && screenshot.size > 0) {
    const path = `${projectId}/${issueId}/${screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("evidence")
      .upload(path, screenshot);
    if (uploadError) return { error: uploadError.message };
    evidenceUrls.push(path);
  }

  const companyId = await getCurrentCompanyId();
  const { error } = await supabase.from("issues").insert({
    id: issueId,
    company_id: companyId,
    source: "manual",
    module_id: moduleId,
    reported_by: user?.id ?? null,
    title,
    description,
    reproduction_steps: [],
    evidence_urls: evidenceUrls,
    tag: null,
    status: "new",
  });

  if (error) return { error: error.message };

  redirect(`/projects/${projectId}/issues/${issueId}`);
}
