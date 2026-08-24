"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { IssueTag } from "@/lib/types/database";

// REQ-052: human resolves an approval-queue item by manually setting the
// tag — a plain UI action, no AI call needed.
export async function resolveApproval(
  projectId: string,
  issueId: string,
  tag: IssueTag
) {
  const supabase = await createClient();
  await supabase
    .from("issues")
    .update({ tag, status: tag === "bug" ? "triaged" : "closed" })
    .eq("id", issueId);

  revalidatePath(`/projects/${projectId}/approval`);
  revalidatePath(`/projects/${projectId}/issues`);
}
