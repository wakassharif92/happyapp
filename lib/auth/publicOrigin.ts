import "server-only";
import { headers } from "next/headers";

// Same reasoning as lib/slack/requestOrigin.ts's getPublicOrigin() (behind
// a tunnel/reverse proxy, the local hop's origin differs from the public
// one the browser actually used) — this variant reads from next/headers
// instead of a NextRequest, since Server Actions (signInWithGoogle,
// linkGoogleAccount) don't receive a request object the way Route
// Handlers do.
export async function getPublicOrigin(): Promise<string> {
  const h = await headers();
  const forwardedProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = h.get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}
