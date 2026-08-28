"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";

// Private per-member — RLS (own_notes, migration 0017) already enforces
// user_id = auth.uid() regardless of what's passed here, but resolving it
// server-side (not trusting a client-supplied user id) matches this app's
// established convention everywhere else identity is attributed.
export async function createNote(input: { text: string; projectId: string | null }) {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("notes")
    .insert({
      company_id: member.companyId,
      user_id: user.id,
      project_id: input.projectId,
      text: input.text,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save note");

  revalidatePath("/dashboard");
  return data;
}

export async function deleteNote(id: string) {
  const supabase = await createClient();
  await supabase.from("notes").delete().eq("id", id);
  revalidatePath("/dashboard");
}
