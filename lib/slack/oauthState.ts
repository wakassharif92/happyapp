import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Encodes project_id (+ a timestamp) into the OAuth `state` param, signed
// with SLACK_CLIENT_SECRET so a caller can't forge a state pointing at a
// project they don't have — Slack passes `state` back verbatim on the
// callback, but doesn't itself protect it from tampering; that's on us.
const MAX_STATE_AGE_MS = 10 * 60 * 1000; // 10 minutes — generous for a user to complete the Slack consent screen

function sign(payload: string): string {
  return createHmac("sha256", process.env.SLACK_CLIENT_SECRET!).update(payload).digest("hex");
}

export function encodeState(projectId: string): string {
  const payload = `${projectId}:${Date.now()}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function decodeState(state: string): { projectId: string } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = decoded.split(":");
  if (parts.length !== 3) return null;
  const [projectId, timestampStr, signature] = parts;

  const expected = sign(`${projectId}:${timestampStr}`);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return null;
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_STATE_AGE_MS) return null;

  return { projectId };
}
