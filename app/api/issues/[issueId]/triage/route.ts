import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triageIssue } from "@/lib/agents/qa-agent/triageIssue";

// REQ-021: triggered per-issue from the "Needs Triage" queue — not
// auto-run on submission, to avoid surprising API costs on every report.
// Fire-and-forget, same pattern as REQ-013's test runs; progress streams
// via agent_events on the issue detail page.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (issue.tag !== null) {
    return NextResponse.json({ error: "Issue is already classified." }, { status: 400 });
  }

  const { data: mod } = await supabase
    .from("modules")
    .select("*")
    .eq("id", issue.module_id)
    .maybeSingle();
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", mod.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await supabase.from("issues").update({ status: "investigating" }).eq("id", issueId);

  triageIssue(project, mod, issue).catch((err) => {
    console.error(`[triage ${issueId}] failed:`, err);
  });

  return NextResponse.json({ ok: true });
}
