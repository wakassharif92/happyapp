import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWhatsappSignature, downloadWhatsappMedia } from "@/lib/whatsapp/graphApi";

// REQ-110/111/114: receives WhatsApp Business Cloud API webhook events. This
// is the one route in the app that legitimately has no Supabase session —
// it's Meta's server calling in, not a logged-in browser — so it's
// exempted from proxy.ts's auth guard and authenticated instead via the
// X-Hub-Signature-256 check below.

// One-time verification handshake Meta performs when the webhook URL is
// first configured (and whenever it's re-verified).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WhatsappValue = {
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: {
    from: string;
    id: string;
    type: string;
    text?: { body: string };
    image?: { id: string; caption?: string };
  }[];
};

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifyWhatsappSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: { entry?: { changes?: { value: WhatsappValue }[] }[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const supabase = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const message of value.messages ?? []) {
        try {
          await handleMessage(supabase, value, message);
        } catch (err) {
          // Log and move on — one bad message shouldn't block the rest of
          // the batch, and Meta will retry the whole delivery on a non-200
          // response, which would just re-fail the same way.
          console.error("[whatsapp webhook] failed to process message:", err);
        }
      }
    }
  }

  // Always 200 quickly — Meta retries on non-200/slow responses, and
  // wa_message_id's unique constraint (REQ-114) makes retries safe.
  return NextResponse.json({ ok: true });
}

async function handleMessage(
  supabase: ReturnType<typeof createAdminClient>,
  value: WhatsappValue,
  message: NonNullable<WhatsappValue["messages"]>[number]
): Promise<void> {
  const contact = value.contacts?.find((c) => c.wa_id === message.from);
  const senderName = contact?.profile?.name ?? null;

  let messageText: string | null = null;
  let imagePath: string | null = null;

  if (message.type === "text") {
    messageText = message.text?.body ?? null;
  } else if (message.type === "image" && message.image) {
    messageText = message.image.caption ?? null;
    const { bytes, mimeType } = await downloadWhatsappMedia(message.image.id);
    const ext = mimeType.split("/")[1] ?? "jpg";
    const path = `${message.id}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: mimeType });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
    imagePath = path;
  } else {
    messageText = `[unsupported message type: ${message.type}]`;
  }

  const { error } = await supabase
    .from("team_reports")
    .upsert(
      {
        source: "whatsapp",
        wa_message_id: message.id,
        sender_name: senderName,
        sender_phone: message.from,
        message_text: messageText,
        image_path: imagePath,
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Insert failed: ${error.message}`);
}
