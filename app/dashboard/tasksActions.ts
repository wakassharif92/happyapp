"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import type { PersonalTask, PersonalTaskStatus } from "@/lib/types/database";

// Private per-member (RLS: own_personal_tasks, migration 0017). Uses
// member.userId (getCurrentMember() already resolved it internally)
// rather than a second supabase.auth.getUser() call — this used to fire
// twice, which was part of why adding a task felt slow.
export async function createPersonalTask(input: {
  title: string;
  taskDate: string;
  projectId: string | null;
}) {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personal_tasks")
    .insert({
      company_id: member.companyId,
      user_id: member.userId,
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

// Swaps two tasks' sort_order values (migration 0021) — same pair-swap
// mechanism as app/dashboard/actions.ts's reorderIssues.
export async function reorderPersonalTasks(
  taskIdA: string,
  sortOrderA: number,
  taskIdB: string,
  sortOrderB: number
) {
  const supabase = await createClient();
  await Promise.all([
    supabase.from("personal_tasks").update({ sort_order: sortOrderA }).eq("id", taskIdA),
    supabase.from("personal_tasks").update({ sort_order: sortOrderB }).eq("id", taskIdB),
  ]);
  revalidatePath("/dashboard");
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

// "A pending task that isn't finished the same day moves itself to the
// next day" — rather than a nightly cron job (no cron infra exists in
// this app), this runs once whenever PersonalTasksPanel loads: any
// not-done task whose task_date is already in the past gets pulled
// forward to today. Since the panel only ever shows "as of today," one
// jump straight to today produces the same end state the user would see
// from a literal day-by-day rollover, with no scheduler needed. RLS
// (own_personal_tasks) already scopes this to the caller's own rows.
export async function rolloverOverdueTasks(todayKey: string): Promise<PersonalTask[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personal_tasks")
    .update({ task_date: todayKey })
    .lt("task_date", todayKey)
    .neq("status", "done")
    .select("*");
  revalidatePath("/dashboard");
  return data ?? [];
}
