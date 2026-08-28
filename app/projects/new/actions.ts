"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company";
import type { AppType } from "@/lib/types/database";

export type CreateProjectState = { error?: string } | undefined;

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const name = (formData.get("name") as string)?.trim();
  const app_type = formData.get("app_type") as AppType;
  const description = (formData.get("description") as string) || null;
  const platform = (formData.get("platform") as string) || null;
  const framework = (formData.get("framework") as string) || null;
  const codebase_path = (formData.get("codebase_path") as string) || null;
  const requirements_doc_ref =
    (formData.get("requirements_doc_ref") as string) || null;
  const automation_target =
    (formData.get("automation_target") as string) || null;

  if (!name) return { error: "Project name is required." };
  if (app_type !== "mobile" && app_type !== "web") {
    return { error: "App type must be mobile or web." };
  }

  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  const { error } = await supabase.from("projects").insert({
    company_id: companyId,
    name,
    description,
    app_type,
    platform: app_type === "mobile" ? platform : null,
    framework,
    codebase_path,
    requirements_doc_ref,
    automation_target,
  });

  if (error) return { error: error.message };

  // Was `/projects/${data.id}/modules` (REQ-074) — a leftover from before
  // the HappyApp rebrand, when the legacy per-project nav (bare project
  // switcher + Links, no branding) was still the primary experience. That
  // now dumps a brand-new signup straight into an unbranded screen right
  // after their first project — /dashboard (the actual HappyApp Issue
  // Board) is the real landing point now; the Modules/Testing pages are
  // still reachable from there for anyone who needs the automated-testing
  // pipeline.
  redirect("/dashboard");
}
