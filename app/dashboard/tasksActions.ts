"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import type { PersonalTaskStatus } from "@/lib/types/database";

// Private per-member (RLS: own_personal_tasks, migration 0017) — same
// identity-resolution reasoning as notesActions.ts.
export async function createPersonalTask(input: {
  title: string;
  taskDate: string;
  projectId: string | null;
}) {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("personal_tasks")
    .insert({
      company_id: member.companyId,
      user_id: user.id,
      project_id: input.projectId,
      task_date: input.taskDate,
      title: input.title,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add task");

  revalidatePath("/dashboard");
  return data;
}

export async function updatePersonalTaskStatus(id: string, status: PersonalTaskStatus) {
  const supabase = await createClient();
  await supabase.from("personal_tasks").update({ status }).eq("id", id);
  revalidatePath("/dashboard");
}

export async function deletePersonalTask(id: string) {
  const supabase = await createClient();
  await supabase.from("personal_tasks").delete().eq("id", id);
  revalidatePath("/dashboard");
}
