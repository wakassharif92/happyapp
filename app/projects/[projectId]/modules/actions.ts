"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company";

export type ModuleFormState = { error?: string } | undefined;

export async function createModule(
  projectId: string,
  _prevState: ModuleFormState,
  formData: FormData
): Promise<ModuleFormState> {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string) || null;
  const requirement_ref = (formData.get("requirement_ref") as string) || null;

  if (!name) return { error: "Module name is required." };

  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  const { error } = await supabase.from("modules").insert({
    company_id: companyId,
    project_id: projectId,
    name,
    description,
    requirement_ref,
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/modules`);
  return undefined;
}

export async function deleteModule(projectId: string, moduleId: string) {
  const supabase = await createClient();
  await supabase.from("modules").delete().eq("id", moduleId);
  revalidatePath(`/projects/${projectId}/modules`);
}
