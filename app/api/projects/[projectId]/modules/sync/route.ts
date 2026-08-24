import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateModules } from "@/lib/agents/qa-agent/generateModules";

// REQ-010: on-demand admin action — not re-run on every page load.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.requirements_doc_ref) {
    return NextResponse.json(
      { error: "Set a requirements doc reference in Project Settings first." },
      { status: 400 }
    );
  }

  try {
    const result = await generateModules(project);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
