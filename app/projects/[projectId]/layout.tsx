import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
// Old QA Agent nav (module sync, automated testing, triage, fix pipeline,
// settings) is commented out rather than deleted — the team-reports flow
// (§14/15) is the primary thing now, but nothing underneath this was
// removed. Uncomment the import + the <OldQaAgentNav /> block below to
// bring it back.
// import { OldQaAgentNav } from "@/components/OldQaAgentNav";
// import { isProjectReady } from "@/lib/projects";
import Link from "next/link";

// REQ-071: project switcher + nav, all scoped to the selected project via the URL.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: projects }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase
      .from("projects")
      .select("id, name, app_type")
      .order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();

  return (
    <div className="flex flex-1">
      <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4">
        <ProjectSwitcher
          projects={projects ?? []}
          currentProjectId={projectId}
        />
        {/* Team Reports and a self-link back to the Issue Board used to
            live here too — removed since the Issue Board (now the app's
            default landing page, and reachable from its own sidebar
            without visiting this legacy area at all) is the primary
            surface; this old project-scoped nav isn't meant to compete
            with it for attention. Team Reports itself still works at
            /reports, just isn't linked from here anymore. */}
        <Link
          href={`/projects/${projectId}/links`}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Links
        </Link>
        {/* <OldQaAgentNav
          projectId={projectId}
          notReadyBanner={
            !isProjectReady(project) && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Set codebase path + automation target in{" "}
                <Link href={`/projects/${projectId}/settings`} className="font-medium underline">
                  Settings
                </Link>{" "}
                before testing can run.
              </p>
            )
          }
        /> */}
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
