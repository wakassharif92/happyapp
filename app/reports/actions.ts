"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TeamReportCategory } from "@/lib/types/database";

// REQ-113: category is a plain human action, not an AI classification — no
// agent call, just a direct update. Applies the same regardless of which
// channel (REQ-110/116) the report came in through.
export async function updateCategory(
  reportId: string,
  category: TeamReportCategory | null
) {
  const supabase = await createClient();
  await supabase.from("team_reports").update({ category }).eq("id", reportId);
  revalidatePath("/reports");
}
