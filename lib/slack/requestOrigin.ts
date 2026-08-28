import "server-only";
import type { NextRequest } from "next/server";

// A tunnel (ngrok, Cloudflare Tunnel, etc.) terminates TLS at its own edge
// and forwards to the local dev server over plain HTTP on localhost — so
// `request.nextUrl.origin` reflects that local hop (`http://localhost:3001`),
// not the public URL Slack (or the browser) actually used. Reverse proxies
// set `X-Forwarded-Proto`/`X-Forwarded-Host` to carry the real origin
// through; this must be used consistently by both /api/slack/connect (which
// sends redirect_uri to Slack) and /api/slack/callback (which sends the
// same redirect_uri back during the token exchange) — a mismatch between
// the two breaks the OAuth flow with a "redirect_uri did not match" error
// from Slack, even though nothing in this app's own config is wrong.
export function getPublicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}
