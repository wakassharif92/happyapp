"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Priority } from "@/lib/types/database";

export type TestCaseFormState = { error?: string } | undefined;

export async function createTestCase(
  projectId: string,
  moduleId: string,
  _prevState: TestCaseFormState,
  formData: FormData
): Promise<TestCaseFormState> {
  const title = (formData.get("title") as string)?.trim();
  const scenario = (formData.get("scenario") as string)?.trim();
  const priority = (formData.get("priority") as Priority) || "medium";

  if (!title || !scenario) {
    return { error: "Title and scenario are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("test_cases").insert({
    module_id: moduleId,
    title,
    scenario,
    priority,
    status: "not_run",
  });

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/testing/${moduleId}`);
  return undefined;
}

export async function deleteTestCase(
  projectId: string,
  moduleId: string,
  testCaseId: string
) {
  const supabase = await createClient();
  await supabase.from("test_cases").delete().eq("id", testCaseId);
  revalidatePath(`/projects/${projectId}/testing/${moduleId}`);
}
