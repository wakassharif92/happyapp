import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/slack/slackApi";
import { decryptToken } from "@/lib/slack/tokenCrypto";

// POST /api/slack/disconnect — body: { project_id }. Revokes the bot
// token with Slack (auth.revoke) so it can't be used even if the row
// somehow leaked before deletion, then removes the connection row itself
// — a clean delete rather than a soft "disconnected" status, so
// reconnecting later is just a fresh OAuth round-trip into an empty slot
// (project_id stays unique either way).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const projectId = body?.project_id as string | undefined;
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

  if (connection) {
    try {
      await revokeToken(decryptToken(connection.access_token));
    } catch {
      // Revocation failing (e.g. token already invalid) shouldn't block
      // removing the row — the goal is "this project no longer has a
      // usable Slack connection," which the delete alone guarantees.
    }
  }

  const { error } = await supabase.from("slack_connections").delete().eq("project_id", projectId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
