import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runTestSuite } from "@/lib/agents/qa-agent/runTestSuite";
import { isProjectReady } from "@/lib/projects";

// REQ-013: "QA It" — creates the test_runs row synchronously (so the client
// gets an id to subscribe to immediately) and then executes the suite as a
// detached async task; progress streams via Supabase Realtime on
// agent_events/test_runs (REQ-070), not this response.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params;
  const body = await req.json().catch(() => ({}) as { testCaseIds?: string[] });
  const testCaseIds = body.testCaseIds;

  const supabase = await createClient();

  const { data: mod } = await supabase
    .from("modules")
    .select("*")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", mod.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!isProjectReady(project)) {
    return NextResponse.json(
      { error: "Set codebase path + automation target in Project Settings first." },
      { status: 400 }
    );
  }

  const { data: allCases } = await supabase
    .from("test_cases")
    .select("*")
    .eq("module_id", moduleId);

  const cases =
    testCaseIds && testCaseIds.length > 0
      ? (allCases ?? []).filter((tc) => testCaseIds.includes(tc.id))
      : (allCases ?? []).filter((tc) => tc.status === "not_run");

  if (cases.length === 0) {
    return NextResponse.json(
      { error: "No test cases to run (nothing is 'not_run' — select cases explicitly to re-run)." },
      { status: 400 }
    );
  }

  const { data: run, error } = await supabase
    .from("test_runs")
    .insert({
      company_id: project.company_id,
      module_id: moduleId,
      status: "running",
      total_cases: cases.length,
    })
    .select()
    .single();
  if (error || !run) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create test run" },
      { status: 500 }
    );
  }

  runTestSuite(project, mod, run, cases).catch((err) => {
    console.error(`[test_run ${run.id}] failed:`, err);
  });

  return NextResponse.json({ test_run_id: run.id });
}
