import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triageIssue } from "@/lib/agents/qa-agent/triageIssue";
import type { Issue, Module, Project } from "@/lib/types/database";

// REQ-021: bulk "Investigate" trigger — runs sequentially (not in parallel)
// so we don't spin up multiple concurrent bridge sessions at once.
export async function POST(req: Request) {
  const { issueIds } = (await req.json().catch(() => ({}))) as { issueIds?: string[] };
  if (!issueIds || issueIds.length === 0) {
    return NextResponse.json({ error: "issueIds is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("*")
    .in("id", issueIds)
    .is("tag", null);
  if (!issues || issues.length === 0) {
    return NextResponse.json({ error: "No untriaged issues found in that selection." }, { status: 400 });
  }

  const moduleIds = [...new Set(issues.map((i) => i.module_id))];
  const { data: modules } = await supabase.from("modules").select("*").in("id", moduleIds);
  const moduleById = new Map((modules ?? []).map((m) => [m.id, m]));

  const projectIds = [...new Set((modules ?? []).map((m) => m.project_id))];
  const { data: projects } = await supabase.from("projects").select("*").in("id", projectIds);
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  await supabase
    .from("issues")
    .update({ status: "investigating" })
    .in("id", issues.map((i) => i.id));

  runSequentially(issues, moduleById, projectById).catch((err) => {
    console.error("[bulk triage] failed:", err);
  });

  return NextResponse.json({ count: issues.length });
}

async function runSequentially(
  issues: Issue[],
  moduleById: Map<string, Module>,
  projectById: Map<string, Project>
) {
  for (const issue of issues) {
    const mod = moduleById.get(issue.module_id);
    const project = mod ? projectById.get(mod.project_id) : undefined;
    if (!mod || !project) continue;
    try {
      await triageIssue(project, mod, issue);
    } catch (err) {
      console.error(`[bulk triage ${issue.id}] failed:`, err);
    }
  }
}
