import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encodeState } from "@/lib/slack/oauthState";
import { getPublicOrigin } from "@/lib/slack/requestOrigin";

// Bot token scopes (qa-agent-spec.md REQ-126) — requested via the `scope`
// param below, distinct from Slack's older `user_scope` for a user token
// (not used here; everything this app does — reading history, downloading
// files, posting confirmations — acts as the bot, not on behalf of the
// connecting user).
const BOT_SCOPES = ["channels:read", "channels:history", "files:read", "chat:write", "team:read"];

// GET /api/slack/connect?project_id=xxx — REQ-127 step 1: redirect the
// user to Slack's OAuth consent screen. project_id is embedded in a
// signed `state` param (lib/slack/oauthState.ts) so the callback knows
// which project to attach the connection to, without trusting an
// unsigned query param an attacker could swap.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  // This route is only ever reached from the authenticated Integrations
  // page, but confirm there's a real session before sending the user
  // through an OAuth flow tied to a project they may not even be able to see.
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID is not configured" }, { status: 500 });
  }

  const redirectUri = new URL("/api/slack/callback", getPublicOrigin(request)).toString();
  const state = encodeState(projectId);

  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", BOT_SCOPES.join(","));
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
