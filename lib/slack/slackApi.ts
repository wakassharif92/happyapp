import "server-only";

const SLACK_API_BASE = "https://slack.com/api";

class SlackApiError extends Error {
  constructor(
    public method: string,
    public slackError: string
  ) {
    super(`Slack API ${method} failed: ${slackError}`);
  }
}

// Every Slack Web API method (even a 4xx-worthy failure) responds 200 with
// {ok: false, error: "..."} rather than a non-2xx status — has to be
// checked explicitly on every call, `response.ok` alone is not enough.
async function callSlack<T>(
  method: string,
  {
    token,
    body,
    query,
  }: { token?: string; body?: Record<string, string>; query?: Record<string, string> } = {}
): Promise<T> {
  const url = new URL(`${SLACK_API_BASE}/${method}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response: Response;
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    response = await fetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(body),
    });
  } else {
    response = await fetch(url, { method: query ? "GET" : "POST", headers });
  }

  const json = (await response.json()) as { ok: boolean; error?: string } & T;
  if (!json.ok) throw new SlackApiError(method, json.error ?? "unknown_error");
  return json;
}

// oauth.v2.access — exchanges the OAuth `code` from the redirect callback
// for a bot access token. Called once, server-side, right after the user
// approves the Slack App install screen.
// https://api.slack.com/methods/oauth.v2.access
export async function exchangeOAuthCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  return callSlack<{
    access_token: string;
    bot_user_id: string;
    team: { id: string; name: string };
  }>("oauth.v2.access", {
    body: {
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    },
  });
}

// conversations.list — lists channels the bot can see, for the
// channel-picker UI. Only requests types=public_channel, matching the base
// bot scopes from docs/slack-setup.md (channels:read) — Slack's API
// requires the scope for EVERY type named in `types`, so asking for
// private_channel too without groups:read/groups:history fails the WHOLE
// call with `missing_scope`, hiding public channels the bot legitimately
// can see. If you've added the optional private-channel scopes (see
// docs/slack-setup.md §2), change `types` below to
// "public_channel,private_channel" to also list those — private channels
// only ever show up if the bot has already been invited to them (Slack
// doesn't expose private channels it isn't a member of, regardless of scope).
// https://api.slack.com/methods/conversations.list
export async function listChannels(token: string) {
  return callSlack<{
    channels: { id: string; name: string; is_private: boolean; is_member: boolean }[];
  }>("conversations.list", {
    token,
    query: { types: "public_channel", exclude_archived: "true", limit: "200" },
  });
}

// users.info — resolves a Slack user id (event.user) to a display name,
// used to populate board_issues.sender_name.
// https://api.slack.com/methods/users.info
export async function getUserDisplayName(token: string, userId: string): Promise<string> {
  try {
    const result = await callSlack<{
      user: { real_name?: string; profile?: { display_name?: string }; name: string };
    }>("users.info", { token, query: { user: userId } });
    return (
      result.user.profile?.display_name || result.user.real_name || result.user.name || userId
    );
  } catch {
    // Non-fatal — a missing display name shouldn't block issue creation.
    return userId;
  }
}

// chat.postMessage — optional confirmation reply in the source thread once
// an issue has been filed (REQ-130). Best-effort: failure here must never
// fail the whole webhook handler.
// https://api.slack.com/methods/chat.postMessage
export async function postThreadReply({
  token,
  channel,
  threadTs,
  text,
}: {
  token: string;
  channel: string;
  threadTs: string;
  text: string;
}) {
  return callSlack("chat.postMessage", {
    token,
    body: { channel, thread_ts: threadTs, text },
  });
}

// auth.revoke — invalidates the stored bot token when a project
// disconnects Slack, so the token can't be used even if the row somehow
// leaked before being deleted.
// https://api.slack.com/methods/auth.revoke
export async function revokeToken(token: string) {
  return callSlack("auth.revoke", { token });
}

// Downloads a file attached to a message. Slack's file URLs (event.files[].
// url_private) require the SAME bot token as every other API call, passed
// as a normal Bearer Authorization header — unlike every other Slack API
// call above, this isn't a slack.com/api/* method, it's a direct fetch of
// the file's own URL.
// https://api.slack.com/types/file#authentication
export async function downloadSlackFile(url: string, token: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`Slack file download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
