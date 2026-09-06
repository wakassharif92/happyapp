import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The AI-callback half of the Releases feature — an external AI coding
// tool (Claude Code, Codex, etc.) hits this after finishing a PR or
// build, same "server calling in with the project's api_token" pattern
// as the existing Vibe Coding AI-Fix callback
// (app/api/vibe-coding/issues/[issueId]/route.ts). The other half is a
// human filling in the "Add Release" form in ReleasesPanel.tsx
// (createRelease, app/dashboard/releasesActions.ts) — both paths write
// the same releases row shape.
type ReleaseBody = {
  category?: string;
  platform?: string;
  os?: string;
  title?: string;
  description?: string;
  link?: string;
  createdBy?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization: Bearer <token>" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("id, company_id, api_token")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.api_token !== token) {
    return NextResponse.json({ error: "Invalid token for this project" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as ReleaseBody;

  const category = body.category;
  if (category !== "backend" && category !== "frontend") {
    return NextResponse.json(
      { error: 'category must be "backend" or "frontend"' },
      { status: 400 }
    );
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.link?.trim()) {
    return NextResponse.json({ error: "link is required" }, { status: 400 });
  }

  // Same category/platform/os hierarchy as migration 0023's check
  // constraint — validated here too so the AI gets a clear message
  // instead of a raw Postgres constraint error.
  let platform: "web" | "mobile" | null = null;
  let os: "ios" | "android" | null = null;
  if (category === "frontend") {
    if (body.platform !== "web" && body.platform !== "mobile") {
      return NextResponse.json(
        { error: 'frontend releases need platform: "web" or "mobile"' },
        { status: 400 }
      );
    }
    platform = body.platform;
    if (platform === "mobile") {
      if (body.os !== "ios" && body.os !== "android") {
        return NextResponse.json(
          { error: 'mobile releases need os: "ios" or "android"' },
          { status: 400 }
        );
      }
      os = body.os;
    }
  } else if (body.platform || body.os) {
    return NextResponse.json(
      { error: "backend releases must not include platform or os" },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("releases")
    .insert({
      company_id: project.company_id,
      project_id: project.id,
      category,
      platform,
      os,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      link: body.link.trim(),
      created_by: body.createdBy?.trim() || "AI",
    })
    .select("id")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to log release" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
