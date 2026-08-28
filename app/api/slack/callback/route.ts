import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentMember } from "@/lib/company";
import { decodeState } from "@/lib/slack/oauthState";
import { exchangeOAuthCode } from "@/lib/slack/slackApi";
import { encryptToken } from "@/lib/slack/tokenCrypto";
import { getPublicOrigin } from "@/lib/slack/requestOrigin";

function redirectToIntegrations(
  request: NextRequest,
  projectId: string,
  params: Record<string, string>
) {
  // Must use the public origin, not request.nextUrl.origin — sending the
  // browser back to a tunnel's local-hop address (localhost) would drop
  // the session cookie it just authenticated with on the public origin.
  const url = new URL(`/projects/${projectId}/integrations`, getPublicOrigin(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

// GET /api/slack/callback — REQ-127 step 2: Slack redirects here after the
// user approves (or denies) the consent screen from /api/slack/connect.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const slackError = request.nextUrl.searchParams.get("error"); // e.g. "access_denied"

  const decoded = state ? decodeState(state) : null;
  if (!decoded) {
    // No project to redirect back to if the state can't be trusted — this
    // is the one failure mode with nowhere sensible to send the user.
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }
  const { projectId } = decoded;

  if (slackError || !code) {
    return redirectToIntegrations(request, projectId, {
      slack: "error",
      message: slackError ?? "missing_code",
    });
  }

  try {
    // oauth.v2.access requires the exact same redirect_uri that was sent
    // to /oauth/v2/authorize — reconstructed identically here via the same
    // getPublicOrigin() logic (both requests come through the same
    // tunnel, so both see the same X-Forwarded-* headers).
    const redirectUri = new URL("/api/slack/callback", getPublicOrigin(request)).toString();
    const result = await exchangeOAuthCode({ code, redirectUri });

    const admin = createAdminClient();

    // Best-effort attribution — the OAuth round-trip through Slack's own
    // domain and back is same-site, so the session cookie normally
    // survives, but this must never block a successful connection if it
    // doesn't for some reason. Also the only session-derived signal
    // available here, so it doubles as the company_id source; if it's
    // unavailable, fall back to resolving company_id off the project
    // itself (the connection is being made FOR this project either way).
    let connectedBy: string | null = null;
    let companyId: string | null = null;
    try {
      const member = await getCurrentMember();
      connectedBy = member?.name ?? null;
      companyId = member?.companyId ?? null;
    } catch {
      // ignore — connectedBy/companyId fall through to the project lookup
    }
    if (!companyId) {
      const { data: project } = await admin
        .from("projects")
        .select("company_id")
        .eq("id", projectId)
        .single();
      companyId = project?.company_id ?? null;
    }
    if (!companyId) {
      return redirectToIntegrations(request, projectId, {
        slack: "error",
        message: "Could not resolve company for this project",
      });
    }

    // No channel yet (REQ-127 step 2 explicitly stores workspace info
    // without one) — the channel picker (POST /api/slack/select-channel)
    // fills that in as a separate step once the user picks from
    // GET /api/slack/channels.
    const { error } = await admin.from("slack_connections").upsert(
      {
        company_id: companyId,
        project_id: projectId,
        team_id: result.team.id,
        team_name: result.team.name,
        access_token: encryptToken(result.access_token),
        bot_user_id: result.bot_user_id,
        status: "pending_channel",
        connected_by: connectedBy,
      },
      { onConflict: "project_id" }
    );

    if (error) {
      return redirectToIntegrations(request, projectId, { slack: "error", message: error.message });
    }

    return redirectToIntegrations(request, projectId, { slack: "connected" });
  } catch (err) {
    return redirectToIntegrations(request, projectId, {
      slack: "error",
      message: err instanceof Error ? err.message : "oauth_exchange_failed",
    });
  }
}
