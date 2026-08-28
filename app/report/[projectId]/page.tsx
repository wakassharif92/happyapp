import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportForm } from "./ReportForm";
import { submitTeamReport } from "./actions";

// Section 14: the project-scoped "Internal Team" link — public, no login,
// deliberately not app/team-report (that one is global, with a project
// dropdown, and writes to the legacy team_reports table). This one's
// project is fixed by the URL and writes into board_issues, so
// submissions show up in that project's Pending tab like everything else
// on the Issue Board (Slack messages, staff-created issues).
export default async function TeamReportLinkPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  // Admin client: no user session on a public page — same pattern as
  // app/team-report/page.tsx.
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) notFound();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold">Report an issue</h1>
        <p className="mt-1 text-sm text-slate-500">
          For {project.name} — found something broken? Let us know, no login needed.
        </p>
      </div>
      <ReportForm action={submitTeamReport.bind(null, projectId)} />
    </div>
  );
}
