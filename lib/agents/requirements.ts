import "server-only";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// REQ-000: requirements_doc_ref is "a pointer — file path, URL, or Supabase
// Storage key." Resolve whichever form the project was configured with.
export async function readRequirementsDoc(
  supabase: SupabaseClient<Database>,
  requirementsDocRef: string | null
): Promise<string> {
  if (!requirementsDocRef) {
    throw new Error("Project has no requirements_doc_ref configured.");
  }

  if (/^https?:\/\//i.test(requirementsDocRef)) {
    const res = await fetch(requirementsDocRef);
    if (!res.ok) {
      throw new Error(`Failed to fetch requirements doc: ${res.status}`);
    }
    return res.text();
  }

  if (requirementsDocRef.startsWith("storage:")) {
    const key = requirementsDocRef.slice("storage:".length);
    const { data, error } = await supabase.storage
      .from("evidence")
      .download(key);
    if (error) throw new Error(`Failed to download requirements doc: ${error.message}`);
    return data.text();
  }

  return readFile(requirementsDocRef, "utf8");
}

const MAX_SECTION_CHARS = 6000;

// Best-effort extraction of the text around a module's requirement_ref
// (e.g. a heading or section id) so the agent isn't fed the entire doc for
// every call. Falls back to a leading slice of the doc if the ref isn't
// found verbatim.
export function extractRequirementSection(
  docText: string,
  requirementRef: string | null
): string {
  if (!requirementRef) return docText.slice(0, MAX_SECTION_CHARS);

  const index = docText.indexOf(requirementRef);
  if (index === -1) return docText.slice(0, MAX_SECTION_CHARS);

  const start = Math.max(0, index - 500);
  const end = Math.min(docText.length, index + MAX_SECTION_CHARS);
  return docText.slice(start, end);
}
