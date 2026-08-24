"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppType } from "@/lib/types/database";

export type UpdateProjectState = { error?: string; success?: boolean } | undefined;

export async function updateProject(
  projectId: string,
  _prevState: UpdateProjectState,
  formData: FormData
): Promise<UpdateProjectState> {
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name,
      description,
      app_type,
      platform: app_type === "mobile" ? platform : null,
      framework,
      codebase_path,
      requirements_doc_ref,
      automation_target,
    })
    .eq("id", projectId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { success: true };
}
