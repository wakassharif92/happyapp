import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import { TeamMembersClient } from "./TeamMembersClient";

// Part D: company-scoped (not project-scoped) — reachable from
// Sidebar.tsx's "Team Members" link regardless of which project is
// currently selected. A standalone top-level route (not nested under
// /projects/[projectId]/), so it gets none of the app's existing layouts
// for free — neither the full dashboard Sidebar (tightly coupled to
// per-project tab state that doesn't apply here) nor the old legacy
// project nav. Gets its own light, branded header instead.
export default async function TeamPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("company_members")
    .select("*")
    .eq("company_id", member.companyId)
    .order("created_at", { ascending: true });

  // Same stable-domain reasoning as the Customer Support / Internal Team
  // links (app/projects/[projectId]/links/page.tsx) — invite links get
  // copied out and shared externally, so they need to stay durable across
  // deploys rather than reflecting whatever host served this request.
  let origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    origin = host ? `${protocol}://${host}` : "";
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3.5">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm shadow-indigo-600/30">
              H
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">HappyApp</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-600">Team Members</span>
          <Link
            href="/dashboard"
            className="ml-auto text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Team Members</h1>
          <p className="mt-1 text-sm text-slate-500">{member.companyName}</p>
        </div>

        <TeamMembersClient
          members={members ?? []}
          currentMemberId={member.id}
          isAdmin={member.isAdmin}
          inviteLinkBase={`${origin}/invite`}
        />
      </div>
    </div>
  );
}
