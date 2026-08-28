import { createAdminClient } from "@/lib/supabase/admin";
import { JoinButton } from "./JoinButton";

// Part D: public (proxy.ts exempts /invite/*, matching /support and
// /report) — the recipient has no session yet, so this and
// app/auth/callback/route.ts's invite branch both use the admin client.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("company_members")
    .select("id, company_id, name, role, invite_status, invite_expires_at")
    .eq("invite_token", token)
    .maybeSingle();

  const isValid =
    invite &&
    invite.invite_status === "pending" &&
    (!invite.invite_expires_at || new Date(invite.invite_expires_at) > new Date());

  let companyName = "";
  if (isValid) {
    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", invite.company_id)
      .maybeSingle();
    companyName = company?.name ?? "";
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-indigo-50 via-slate-50 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-semibold text-white shadow-md shadow-indigo-600/20">
            H
          </div>
          <h1 className="text-xl font-semibold text-slate-900">HappyApp</h1>
        </div>

        <div className="card p-8 shadow-lg shadow-slate-900/5">
          {isValid ? (
            <>
              <p className="text-center text-sm text-slate-600">
                You&apos;ve been invited to join
              </p>
              <p className="mt-1 text-center text-lg font-semibold text-slate-900">
                {companyName}
              </p>
              <p className="mt-1 text-center text-sm text-slate-500">as {invite.role}</p>

              <div className="mt-5">
                <JoinButton token={token} />
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900">This invite link isn&apos;t valid</p>
              <p className="mt-1 text-sm text-slate-500">
                It may have expired or already been used. Ask your admin for a new link.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
