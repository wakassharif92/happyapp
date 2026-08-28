"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";

export type AddDocumentState = { error?: string } | undefined;

// Admin-only, enforced both here (fast, clear error) and by RLS's
// admin_write_documents policy (migration 0017) — "only a link can be
// added" is deliberate: no file upload, just {name, url}.
export async function addDocument(
  projectId: string,
  _prevState: AddDocumentState,
  formData: FormData
): Promise<AddDocumentState> {
  const name = (formData.get("name") as string)?.trim();
  const documentUrl = (formData.get("url") as string)?.trim();

  if (!name) return { error: "Document name is required." };
  if (!documentUrl) return { error: "Link is required." };
  try {
    new URL(documentUrl);
  } catch {
    return { error: "Enter a valid URL (including https://)." };
  }

  const member = await getCurrentMember();
  if (!member) return { error: "Not signed in." };
  if (!member.isAdmin) return { error: "Only admins can add documents." };

  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    company_id: member.companyId,
    project_id: projectId,
    name,
    url: documentUrl,
    created_by: member.name,
  });
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/documents`);
  return undefined;
}

export async function deleteDocument(projectId: string, documentId: string) {
  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", documentId);
  revalidatePath(`/projects/${projectId}/documents`);
}
