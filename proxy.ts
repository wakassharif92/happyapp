import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Auth session guard (Next.js 16 renames `middleware` to `proxy`).
// Optimistic check only, per Next's auth guide: redirect unauthenticated
// users to /login, and authenticated users away from /login.
export async function proxy(request: NextRequest) {
  // REQ-110/115/116: the WhatsApp webhook has no Supabase session (Meta's
  // server calling in, authenticated instead via the X-Hub-Signature-256
  // check inside the route itself), and the public report form deliberately
  // has no login (that's the entire point of REQ-116 — no app to configure,
  // no account needed). Skip the session flow entirely for both rather than
  // folding them into isAuthRoute below, which also drives the opposite
  // "redirect away from /login when already signed in" branch that doesn't
  // apply here.
  // REQ-128: same reasoning as the WhatsApp webhook above — Slack's
  // server calling in has no session cookie, authenticated instead via
  // the X-Slack-Signature check inside the route itself.
  // Section 14: /support/[projectId] and /report/[projectId] are the two
  // per-project public links (customer chat, team report) — both public
  // by design, secured by RLS (support chat's anonymous-auth identity) or
  // by simply having no sensitive read surface (team report, write-only).
  if (
    request.nextUrl.pathname.startsWith("/api/webhooks/whatsapp") ||
    request.nextUrl.pathname.startsWith("/team-report") ||
    request.nextUrl.pathname.startsWith("/api/slack/events") ||
    request.nextUrl.pathname.startsWith("/support/") ||
    request.nextUrl.pathname.startsWith("/report/")
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() reads the session from the request cookie with no network
  // round-trip (unlike getUser(), which re-validates against Supabase Auth
  // on every call). This runs on every navigation, so that round-trip was
  // adding real, avoidable latency to every single page load. It's safe to
  // use here because this check is purely for the redirect/UX decision —
  // the actual security boundary is Postgres RLS, which independently
  // rejects any invalid/expired token on every real data call regardless
  // of what this optimistic check decided.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");

  if (!session && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (session && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
