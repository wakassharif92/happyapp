import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Section 17 (REQ-155): the callback an external AI coding tool (Claude
// Code, Codex, etc.) hits after attempting a fix — handed to the dev as a
// ready-made curl command alongside the (description-only) PDF from "For
// Vibe Coding," not embedded in the PDF itself. No user session — this is
// a machine calling in, same reasoning as the Slack/WhatsApp webhooks
// (authenticated via a shared secret instead, here the project's
// api_token). Deliberately narrow: this token can only move an issue to
// ai_fix and leave a comment — it can't close/delete anything or touch
// another project.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization: Bearer <token>" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { summary?: string };

  const admin = createAdminClient();

  const { data: issue } = await admin
    .from("board_issues")
    .select("id, company_id, project_id, title")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("api_token")
    .eq("id", issue.project_id)
    .single();
  if (!project || project.api_token !== token) {
    return NextResponse.json({ error: "Invalid token for this project" }, { status: 403 });
  }

  await admin.from("board_issues").update({ tab: "ai_fix" }).eq("id", issueId);

  await admin.from("board_issue_comments").insert({
    company_id: issue.company_id,
    issue_id: issueId,
    author: "AI (Vibe Coding)",
    text: body.summary?.trim() || "Fix attempted — needs human verification.",
  });

  await admin.from("board_issue_activity").insert({
    company_id: issue.company_id,
    issue_id: issueId,
    text: "Marked ready for verification (AI Fix)",
    actor: "AI (Vibe Coding)",
  });

  return NextResponse.json({ ok: true });
}
