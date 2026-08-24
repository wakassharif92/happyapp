import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isProjectReady } from "@/lib/projects";
import { ModuleCardButton } from "./ModuleCardButton";
import { ProgressBar } from "@/components/ProgressBar";

// REQ-011: module cards — name, test case count, last run status, action button.
export default async function TestingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: modules }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase
      .from("modules")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);
  const ready = project ? isProjectReady(project) : false;

  const cards = await Promise.all(
    (modules ?? []).map(async (mod) => {
      const [{ count: testCaseCount }, { data: lastRun }] = await Promise.all(
        [
          supabase
            .from("test_cases")
            .select("*", { count: "exact", head: true })
            .eq("module_id", mod.id),
          supabase
            .from("test_runs")
            .select("status, passed_count, failed_count, total_cases")
            .eq("module_id", mod.id)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]
      );
      return { module: mod, testCaseCount: testCaseCount ?? 0, lastRun };
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Automated Testing</h1>

      {cards.length === 0 ? (
        <p className="text-sm text-slate-500">
          No modules yet.{" "}
          <Link
            href={`/projects/${projectId}/modules`}
            className="underline"
          >
            Add a module
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {cards.map(({ module: mod, testCaseCount, lastRun }) => (
            <div
              key={mod.id}
              className="flex flex-col gap-2 card p-4"
            >
              <Link
                href={`/projects/${projectId}/testing/${mod.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {mod.name}
              </Link>
              <p className="text-sm text-slate-500">
                {testCaseCount} test case{testCaseCount === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-slate-500">
                {lastRun
                  ? `Last run: ${lastRun.status} — ${lastRun.passed_count}/${lastRun.total_cases} passed, ${lastRun.failed_count} failed`
                  : "Never run"}
              </p>
              {lastRun && (
                <ProgressBar
                  passed={lastRun.passed_count}
                  failed={lastRun.failed_count}
                  total={lastRun.total_cases}
                />
              )}
              {ready ? (
                <ModuleCardButton
                  projectId={projectId}
                  moduleId={mod.id}
                  hasTestCases={testCaseCount > 0}
                />
              ) : (
                <button
                  disabled
                  title="Set codebase path + automation target in Project Settings first"
                  className="mt-2 self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-400"
                >
                  {testCaseCount === 0 ? "Generate Test Cases" : "QA It"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
