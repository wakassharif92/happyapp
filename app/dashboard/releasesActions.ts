"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import type { Release, ReleaseCategory, ReleaseOs, ReleasePlatform } from "@/lib/types/database";

// Manual half of release logging — the other half is external AI tools
// calling POST /api/releases/[projectId] directly (app/api/releases/
// [projectId]/route.ts), same as this app's other "either a human fills
// a form, or an AI calls the matching API" pairs (Vibe Coding's AI Fix
// callback being the closest one).
export async function createRelease(input: {
  projectId: string;
  category: ReleaseCategory;
  platform: ReleasePlatform | null;
  os: ReleaseOs | null;
  title: string;
  description: string;
  link: string;
}): Promise<Release> {
  const member = await getCurrentMember();
  if (!member) throw new Error("Not signed in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .insert({
      company_id: member.companyId,
      project_id: input.projectId,
      category: input.category,
      platform: input.platform,
      os: input.os,
      title: input.title,
      description: input.description || null,
      link: input.link,
      created_by: member.name,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to log release");

  revalidatePath("/dashboard");
  return data;
}

export async function deleteRelease(id: string) {
  const supabase = await createClient();
  await supabase.from("releases").delete().eq("id", id);
  revalidatePath("/dashboard");
}
