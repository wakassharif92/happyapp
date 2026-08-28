import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFix } from "@/lib/agents/programming-agent/runFix";
import type { Issue, Module, Severity } from "@/lib/types/database";

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
function severityRank(s: Severity | null): number {
  return s ? (SEVERITY_RANK[s] ?? 3) : 3;
}

// REQ-060: fix batch trigger — up to N issues where tag='bug' and
// status='triaged', ordered by severity, scoped to the current project.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { count } = (await req.json().catch(() => ({}))) as { count?: number };
  const n = Math.max(1, Math.min(Number(count) || 1, 20));

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.codebase_path) {
    return NextResponse.json(
      { error: "Set a codebase path in Project Settings first." },
      { status: 400 }
    );
  }

  const { data: modules } = await supabase.from("modules").select("*").eq("project_id", projectId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  const moduleById = new Map<string, Module>((modules ?? []).map((m) => [m.id, m]));
  if (moduleIds.length === 0) {
    return NextResponse.json({ error: "No modules in this project." }, { status: 400 });
  }

  const { data: candidates } = await supabase
    .from("issues")
    .select("*")
    .in("module_id", moduleIds)
    .eq("tag", "bug")
    .eq("status", "triaged");

  const selected = ((candidates ?? []) as Issue[])
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .slice(0, n);

  if (selected.length === 0) {
    return NextResponse.json(
      { error: "No triaged bugs available to fix right now." },
      { status: 400 }
    );
  }

  const { data: run, error } = await supabase
    .from("programming_agent_runs")
    .insert({
      company_id: project.company_id,
      issue_ids: selected.map((i) => i.id),
      status: "running",
    })
    .select()
    .single();
  if (error || !run) {
    return NextResponse.json({ error: error?.message ?? "Failed to create fix run" }, { status: 500 });
  }

  await supabase
    .from("issues")
    .update({ status: "fixing", assigned_agent_run_id: run.id })
    .in("id", selected.map((i) => i.id));

  const issuesWithModules = selected.map((issue) => ({
    issue: { ...issue, status: "fixing" as const, assigned_agent_run_id: run.id },
    module: moduleById.get(issue.module_id)!,
  }));

  runFix(project, run, issuesWithModules).catch((err) => {
    console.error(`[fix ${run.id}] failed:`, err);
  });

  return NextResponse.json({ programming_agent_run_id: run.id, count: selected.length });
}
