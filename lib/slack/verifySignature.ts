import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Slack's request-signing scheme (https://api.slack.com/authentication/verifying-requests-from-slack):
// signature = "v0=" + HMAC-SHA256(signing_secret, "v0:" + timestamp + ":" + rawBody)
// Must run against the RAW body (before JSON.parse) — same requirement as
// the WhatsApp webhook's X-Hub-Signature-256 check in lib/whatsapp/graphApi.ts.
const VERSION = "v0";
const MAX_CLOCK_SKEW_SECONDS = 60 * 5; // Slack's own replay-protection guidance

export function verifySlackSignature({
  rawBody,
  timestampHeader,
  signatureHeader,
  signingSecret,
}: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  signingSecret: string;
}): boolean {
  if (!timestampHeader || !signatureHeader) return false;
  if (!signatureHeader.startsWith(`${VERSION}=`)) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > MAX_CLOCK_SKEW_SECONDS) return false; // replay protection

  const base = `${VERSION}:${timestampHeader}:${rawBody}`;
  const expected = `${VERSION}=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}
