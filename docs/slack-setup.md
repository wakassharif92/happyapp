# Slack integration — App setup

Covers creating and configuring the Slack App this integration talks to.
Code-side details (schema, routes, encryption) are in `qa-agent-spec.md`
Section 13 and `PROGRESS.md`'s corresponding entry — this file is only the
"what to click in Slack's dashboard" half.

## 1. Create the Slack App

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. "QA Agent") and pick the workspace you'll use for testing.
   Each *project* in this app connects its own workspace/channel later via
   OAuth (Section 13, REQ-126) — this initial workspace is just where you
   develop against.

## 2. Bot token scopes

**OAuth & Permissions** → **Scopes** → **Bot Token Scopes** → add:

| Scope | Why |
|---|---|
| `channels:read` | List channels for the channel-picker UI (`conversations.list`) |
| `channels:history` | Receive message events from public channels |
| `files:read` | Download image/video attachments on a message |
| `chat:write` | Post the optional "✅ Logged as an issue" confirmation reply |
| `team:read` | Resolve the workspace name shown on the Integrations page |

If you also want to support **private channels**, add `groups:read` and
`groups:history` too, and invite the bot into the private channel manually
in Slack — the Slack API only returns/receives events for private channels
the bot has actually been added to, regardless of scopes.

## 3. OAuth & Permissions — redirect URL

Same page, **Redirect URLs** → add:

```
https://<your-domain>/api/slack/callback
```

During local development, that's your tunnel URL (see "Local development"
below) — e.g. `https://abcd1234.ngrok-free.app/api/slack/callback`. This
must exactly match what the app sends as `redirect_uri` (it's derived from
the request's own `Host` header at runtime — see
`app/api/slack/connect/route.ts` — so as long as you're hitting the app
through the same URL you registered here, it always matches).

## 4. Event Subscriptions

**Event Subscriptions** → toggle **on**.

**Request URL**:

```
https://<your-domain>/api/slack/events
```

Slack immediately sends a `url_verification` challenge to this URL when
you save it — the route (`app/api/slack/events/route.ts`) answers it
automatically, but only after the request signature checks out, so
`SLACK_SIGNING_SECRET` must already be set in your `.env.local` (see
below) *before* you save this URL, or verification will fail.

**Subscribe to bot events** → add:

- `message.channels` (public channel messages)
- `message.groups` (private channel messages, if you added the private-channel scopes above)

## 5. Basic Information — credentials

**Basic Information** page has everything for your `.env.local`:

```bash
SLACK_CLIENT_ID=...        # "App Credentials" section
SLACK_CLIENT_SECRET=...    # "App Credentials" section — click "Show"
SLACK_SIGNING_SECRET=...   # "App Credentials" section — click "Show"
```

`SLACK_TOKEN_ENCRYPTION_KEY` is unrelated to Slack itself — it's a key
*this app* generates to encrypt stored bot tokens at rest
(`lib/slack/tokenCrypto.ts`). One was already generated into your
`.env.local`; see that file's comment before touching it.

## 6. Install the app / reinstall after scope changes

**Install App** → **Install to Workspace**. Any time you add or remove a
scope in step 2, Slack requires reinstalling before the new scopes take
effect — the OAuth connect flow in this app (`/api/slack/connect`) does
this per-project automatically going forward, but the *first* install to
your dev workspace has to be done here manually once.

## Local development (tunnel required)

Slack needs a public HTTPS URL for both the OAuth redirect and the Events
Request URL — `localhost` alone doesn't work, same constraint as the
WhatsApp integration. Tunnel your dev server (e.g. `ngrok http 3000`) and
use the tunnel's HTTPS URL for steps 3 and 4 above. The tunnel URL changes
every time you restart `ngrok` (free tier) — update both URLs in the Slack
App dashboard whenever that happens, or the OAuth flow and events will
both silently stop matching what's configured.

## Connecting a project (end-user flow, once the App above exists)

1. From a project's **Integrations** page in this app, click **Connect** —
   this hits `GET /api/slack/connect?project_id=...`, which redirects to
   Slack's consent screen with the scopes from step 2.
2. Approve the install. Slack redirects back to
   `GET /api/slack/callback`, which exchanges the code for a bot token and
   stores the workspace connection (no channel yet).
3. Pick a channel from the picker that opens automatically — this calls
   `GET /api/slack/channels` then `POST /api/slack/select-channel`. Only
   channels the bot can see appear (public channels, or private channels
   it's already been invited to).
4. Done — messages posted in that channel now create issues in the
   project's Pending tab within a few seconds.

To disconnect, use the **Disconnect** button on the Integrations page
(`POST /api/slack/disconnect`) — this revokes the bot token with Slack and
deletes the stored connection.
