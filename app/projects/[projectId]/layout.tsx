import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { NavLinks } from "@/components/NavLinks";
import { isProjectReady } from "@/lib/projects";
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
        <Link href="/projects" className="flex items-center gap-2 px-1 py-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
            Q
          </span>
          <span className="text-sm font-semibold text-slate-900">QA Agent</span>
        </Link>
        <ProjectSwitcher
          projects={projects ?? []}
          currentProjectId={projectId}
        />
        <NavLinks projectId={projectId} />
        {!isProjectReady(project) && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Set codebase path + automation target in{" "}
            <Link href={`/projects/${projectId}/settings`} className="font-medium underline">
              Settings
            </Link>{" "}
            before testing can run.
          </p>
        )}
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
