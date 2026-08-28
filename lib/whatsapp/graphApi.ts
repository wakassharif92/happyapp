import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

// REQ-110: every webhook POST carries X-Hub-Signature-256, an HMAC-SHA256 of
// the *raw* request body keyed with the app secret — must be verified before
// anything in the payload is trusted. Hashing a re-serialized JSON.stringify
// of the parsed body would silently produce a different signature, so the
// caller must pass the untouched raw text.
export function verifyWhatsappSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// REQ-111: two-step download — resolve a short-lived media URL from the
// media id, then fetch it. Both calls need the same bearer token; the
// resolved URL is only valid for ~5 minutes, so this must be called
// immediately after the webhook arrives, not deferred.
export async function downloadWhatsappMedia(mediaId: string): Promise<{
  bytes: Buffer;
  mimeType: string;
}> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");

  const lookupUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${mediaId}`);
  if (phoneNumberId) lookupUrl.searchParams.set("phone_number_id", phoneNumberId);

  const lookupRes = await fetch(lookupUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!lookupRes.ok) {
    throw new Error(`WhatsApp media lookup failed (${lookupRes.status}): ${await lookupRes.text()}`);
  }
  const lookup = (await lookupRes.json()) as { url: string; mime_type: string };

  const mediaRes = await fetch(lookup.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) {
    throw new Error(`WhatsApp media download failed (${mediaRes.status}): ${await mediaRes.text()}`);
  }

  return {
    bytes: Buffer.from(await mediaRes.arrayBuffer()),
    mimeType: lookup.mime_type,
  };
}
