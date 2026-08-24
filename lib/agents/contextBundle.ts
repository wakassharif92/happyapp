import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readRequirementsDoc, extractRequirementSection } from "@/lib/agents/requirements";
import { searchCodebase } from "@/lib/agents/codebase";
import type { Database, Issue, Module, Project } from "@/lib/types/database";

export type ContextBundle = {
  issue_id: string;
  title: string;
  description: string;
  reproduction_steps: string[];
  tag_reasoning: string;
  relevant_requirement_text: string;
  relevant_files: string[];
};

// REQ-061: a minimal, self-contained payload per issue — the Programming
// Agent gets exactly this, never the QA Agent's conversation history or
// other issues' context.
export async function buildContextBundle(
  supabase: SupabaseClient<Database>,
  project: Project,
  module: Module,
  issue: Issue
): Promise<ContextBundle> {
  let relevant_requirement_text = "";
  try {
    const docText = await readRequirementsDoc(supabase, project.requirements_doc_ref);
    relevant_requirement_text = extractRequirementSection(docText, module.requirement_ref);
  } catch {
    // no requirements doc configured / unreadable — proceed without it
  }

  const relevantFiles = new Set<string>();
  const keywords = issue.title
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  for (const keyword of keywords) {
    if (relevantFiles.size >= 5) break;
    try {
      const result = await searchCodebase(project.codebase_path ?? "", keyword);
      for (const line of result.split("\n")) {
        const match = line.match(/^([^:]+):/);
        if (match) relevantFiles.add(match[1]);
        if (relevantFiles.size >= 5) break;
      }
    } catch {
      // best-effort only
    }
  }

  return {
    issue_id: issue.id,
    title: issue.title,
    description: issue.description ?? "",
    reproduction_steps: issue.reproduction_steps,
    tag_reasoning: issue.tag_reasoning ?? "",
    relevant_requirement_text,
    relevant_files: [...relevantFiles],
  };
}
