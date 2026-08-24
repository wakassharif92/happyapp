import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTestCases } from "@/lib/agents/qa-agent/generateTestCases";

// REQ-012: generate test cases for a module; saved to test_cases before
// being shown to the user (who can then edit/delete via plain CRUD).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const { moduleId } = await params;
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
  if (!project.requirements_doc_ref) {
    return NextResponse.json(
      { error: "Set a requirements doc reference in Project Settings first." },
      { status: 400 }
    );
  }

  try {
    const result = await generateTestCases(project, mod);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
