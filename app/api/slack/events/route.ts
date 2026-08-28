import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySlackSignature } from "@/lib/slack/verifySignature";
import { downloadSlackFile, getUserDisplayName, postThreadReply } from "@/lib/slack/slackApi";
import { decryptToken } from "@/lib/slack/tokenCrypto";
import { isRateLimited } from "@/lib/slack/rateLimit";

// REQ-128/129: single shared endpoint for every connected project's Slack
// events. Like the WhatsApp webhook, this route legitimately has no
// Supabase session — it's Slack's server calling in — and is authenticated
// instead via the X-Slack-Signature check below, verified against the RAW
// body (must be read before any JSON.parse).

type SlackFile = { url_private: string; mimetype: string; name: string };

type SlackMessageEvent = {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  files?: SlackFile[];
};

type SlackEventPayload =
  | { type: "url_verification"; challenge: string }
  | {
      type: "event_callback";
      team_id: string;
      event: SlackMessageEvent;
    };

export async function POST(req: Request) {
  const rawBody = await req.text();

  const signatureValid = verifySlackSignature({
    rawBody,
    timestampHeader: req.headers.get("x-slack-request-timestamp"),
    signatureHeader: req.headers.get("x-slack-signature"),
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
  });
  if (!signatureValid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: SlackEventPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  // One-time (and periodic re-)verification Slack performs when the Event
  // Subscriptions URL is first configured — echo the challenge straight
  // back, no async work involved.
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback") {
    if (isRateLimited(payload.team_id)) {
      // Dropped, not queued for retry — see lib/slack/rateLimit.ts and the
      // "always 200" reasoning below; a burst that trips this is far more
      // likely to be a retry storm than legitimate traffic worth replaying.
      console.warn(`[slack events] rate limit hit for team ${payload.team_id}`);
      return NextResponse.json({ ok: true });
    }

    // Ack within Slack's 3-second budget, then do the real work (file
    // download, Storage upload, DB insert) after responding. This only
    // works because the app runs as one long-lived Node process (see
    // PROGRESS.md's note on the automation bridges) — a serverless
    // deployment would need a real queue instead, since the process can
    // be frozen the instant the response is sent.
    processMessageEvent(payload.team_id, payload.event).catch((err) => {
      console.error("[slack events] failed to process message event:", err);
    });
  }

  // Always 200 quickly — Slack retries on non-200/slow responses, and the
  // dedup below (unique index on slack_channel_id + slack_message_ts)
  // makes retries safe rather than something to avoid via a slow ack.
  return NextResponse.json({ ok: true });
}

async function processMessageEvent(teamId: string, event: SlackMessageEvent): Promise<void> {
  // Only plain new messages create issues — not bot messages (event.bot_id
  // set, includes this app's own confirmation replies), edits
  // (message_changed), or deletions (message_deleted).
  if (event.type !== "message") return;
  if (event.bot_id) return;
  if (event.subtype === "message_changed" || event.subtype === "message_deleted") return;
  if (!event.user || !event.text) return;

  const admin = createAdminClient();

  const { data: connection } = await admin
    .from("slack_connections")
    .select("*")
    .eq("team_id", teamId)
    .eq("channel_id", event.channel)
    .eq("status", "connected")
    .maybeSingle();

  // Not from a channel any project has connected — ignore silently. This
  // is expected/routine (the shared endpoint receives events for every
  // team_id+channel_id this Slack App is installed into, connected here
  // or not), not an error condition worth logging.
  if (!connection) return;

  const token = decryptToken(connection.access_token);

  // users.info — resolve the Slack user id to a display name for
  // board_issues.sender_name (see lib/slack/slackApi.ts).
  const senderName = await getUserDisplayName(token, event.user);

  let mediaUrl: string | null = null;
  let mediaType: "image" | "video" | "none" = "none";
  let attachmentNote = "";

  const firstMediaFile = event.files?.find(
    (f) => f.mimetype.startsWith("image/") || f.mimetype.startsWith("video/")
  );
  if (firstMediaFile) {
    try {
      const bytes = await downloadSlackFile(firstMediaFile.url_private, token);
      const isVideo = firstMediaFile.mimetype.startsWith("video/");
      const ext = firstMediaFile.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
      const path = `slack-${crypto.randomUUID()}.${ext}`;
      // Reusing the existing private "whatsapp-media" bucket (already the
      // home for both WhatsApp and team-report web-form uploads — the name
      // is a legacy artifact at this point, not a scoping boundary) rather
      // than provisioning a new one.
      const { error: uploadError } = await admin.storage
        .from("whatsapp-media")
        .upload(path, bytes, { contentType: firstMediaFile.mimetype });
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
      // Stored as the object PATH, not a public URL — this is a private
      // bucket, so callers resolve a short-lived signed URL at render
      // time (same convention as team_reports.image_path).
      mediaUrl = path;
      mediaType = isVideo ? "video" : "image";
    } catch (err) {
      console.error("[slack events] file download/upload failed:", err);
    }
  } else if (event.files && event.files.length > 0) {
    // A file was attached but isn't an image/video the Board can show
    // (e.g. a PDF) — note it in the text rather than silently dropping it.
    attachmentNote = `\n\n[attachment: ${event.files[0].name}]`;
  }

  const title = event.text.length > 60 ? `${event.text.slice(0, 60)}…` : event.text;

  // Dedup (REQ-129/131): the partial unique index on
  // (slack_channel_id, slack_message_ts) makes a retried delivery of the
  // same message a no-op insert rather than a duplicate issue.
  const { data: inserted, error } = await admin
    .from("board_issues")
    .upsert(
      {
        company_id: connection.company_id,
        project_id: connection.project_id,
        tab: "pending",
        title,
        message: `${event.text}${attachmentNote}`,
        sender_name: senderName,
        source_channel: "Slack",
        category: "Other",
        media_url: mediaUrl,
        media_type: mediaType,
        slack_channel_id: event.channel,
        slack_message_ts: event.ts,
      },
      { onConflict: "slack_channel_id,slack_message_ts", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Insert failed: ${error.message}`);
  if (!inserted) return; // duplicate delivery — already handled, nothing further to do

  await admin.from("board_issue_activity").insert({
    company_id: connection.company_id,
    issue_id: inserted.id,
    text: "Reported via Slack",
    actor: senderName,
  });

  // REQ-130 (optional): confirmation reply in the source thread.
  // Best-effort — a failure here must never surface as a webhook failure,
  // the issue is already created either way.
  try {
    await postThreadReply({
      token,
      channel: event.channel,
      threadTs: event.ts,
      text: `✅ Logged as an issue in Pending.`,
    });
  } catch (err) {
    console.error("[slack events] thread reply failed:", err);
  }
}
