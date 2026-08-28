import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listChannels } from "@/lib/slack/slackApi";
import { decryptToken } from "@/lib/slack/tokenCrypto";

// GET /api/slack/channels?project_id=xxx — REQ-127 step 3: list channels
// for the channel-picker UI, using the bot token already stored from the
// OAuth step. Requires a connection to already exist (i.e. OAuth already
// completed) but not yet a channel_id.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from("slack_connections")
    .select("access_token")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json(
      { error: "No Slack connection for this project yet — connect a workspace first." },
      { status: 404 }
    );
  }

  try {
    const token = decryptToken(connection.access_token);
    // conversations.list (see lib/slack/slackApi.ts) — only returns
    // channels the bot is already a member of (for private channels) or
    // any public channel in the workspace.
    const result = await listChannels(token);
    const channels = result.channels
      .filter((c) => !c.is_private || c.is_member)
      .map((c) => ({ id: c.id, name: c.name, isPrivate: c.is_private }));
    return NextResponse.json({ channels });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list Slack channels" },
      { status: 502 }
    );
  }
}
