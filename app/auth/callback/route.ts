import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicOrigin } from "@/lib/slack/requestOrigin";

// Handles the OAuth return for every Google sign-in path this app has:
// a fresh sign-in, a team-invite claim (Part D — invite_token present),
// linking Google onto the existing password account
// (app/login/actions.ts's linkGoogleAccount), and Supabase's
// `exchangeCodeForSession` already knows which of these it is from the
// `code` itself — this route only needs to branch on what happens AFTER
// the session exists.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const inviteToken = request.nextUrl.searchParams.get("invite_token");
  const origin = getPublicOrigin(request);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data: exchangeData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchangeData.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError?.message ?? "auth_failed")}`
    );
  }
  const user = exchangeData.user;
  const admin = createAdminClient();

  if (inviteToken) {
    const { data: invite } = await admin
      .from("company_members")
      .select("id, invite_status, invite_expires_at")
      .eq("invite_token", inviteToken)
      .maybeSingle();

    const isValid =
      invite &&
      invite.invite_status === "pending" &&
      (!invite.invite_expires_at || new Date(invite.invite_expires_at) > new Date());

    if (!isValid) {
      return NextResponse.redirect(`${origin}/invite/${inviteToken}?error=expired`);
    }

    await admin
      .from("company_members")
      .update({
        user_id: user.id,
        invite_status: "active",
        activated_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const { data: existingMember } = await admin
    .from("company_members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMember) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // Brand new Google identity, no invite, no existing membership — needs
  // to create (or, for the one-time linkGoogleAccount migration case,
  // already has a membership under the SAME user.id, so this branch is
  // never reached for that path) a company from scratch.
  return NextResponse.redirect(`${origin}/onboarding`);
}
