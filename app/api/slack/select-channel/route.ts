import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/slack/select-channel — REQ-127 step 4: the last step of
// connecting — attaches a specific channel to the already-OAuth'd
// workspace, flipping the connection to fully "connected". Body:
// { project_id, channel_id, channel_name }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const projectId = body?.project_id as string | undefined;
  const channelId = body?.channel_id as string | undefined;
  const channelName = body?.channel_name as string | undefined;

  if (!projectId || !channelId || !channelName) {
    return NextResponse.json(
      { error: "project_id, channel_id, and channel_name are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("slack_connections")
    .update({ channel_id: channelId, channel_name: channelName, status: "connected" })
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "No Slack connection for this project yet — connect a workspace first." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
