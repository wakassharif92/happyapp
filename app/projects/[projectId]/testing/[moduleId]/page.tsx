import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddTestCaseForm } from "./AddTestCaseForm";
import { TestRunPanel } from "./TestRunPanel";
import { createTestCase, deleteTestCase } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  not_run: "text-slate-500",
  running: "text-amber-600 dark:text-amber-400",
  pass: "text-emerald-600 dark:text-emerald-400",
  fail: "text-red-600 dark:text-red-400",
};

// REQ-012: generated (or manually added) test cases — simple CRUD, no AI needed here.
export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; moduleId: string }>;
}) {
  const { projectId, moduleId } = await params;
  const supabase = await createClient();

  const [{ data: mod }, { data: testCases }, { data: latestRun }] = await Promise.all([
    supabase.from("modules").select("*").eq("id", moduleId).maybeSingle(),
    supabase
      .from("test_cases")
      .select("*")
      .eq("module_id", moduleId)
      .order("created_at", { ascending: true }),
    supabase
      .from("test_runs")
      .select("*")
      .eq("module_id", moduleId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!mod) notFound();

  const initialEvents = latestRun
    ? (
        await supabase
          .from("agent_events")
          .select("*")
          .eq("run_type", "test_run")
          .eq("run_id", latestRun.id)
          .order("created_at", { ascending: true })
      ).data ?? []
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{mod.name}</h1>
        {mod.description && (
          <p className="mt-1 text-sm text-slate-500">{mod.description}</p>
        )}
      </div>

      <TestRunPanel
        moduleId={moduleId}
        testCaseCount={testCases?.length ?? 0}
        initialRun={latestRun ?? null}
        initialEvents={initialEvents}
      />

      <AddTestCaseForm
        action={createTestCase.bind(null, projectId, moduleId)}
      />

      {!testCases || testCases.length === 0 ? (
        <p className="text-sm text-slate-500">
          No test cases yet. Add one manually above.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {testCases.map((tc) => (
            <li
              key={tc.id}
              className="flex items-start justify-between gap-4 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tc.title}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {tc.priority}
                  </span>
                  <span
                    className={`text-xs capitalize ${STATUS_COLOR[tc.status]}`}
                  >
                    {tc.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {tc.scenario}
                </p>
              </div>
              <form
                action={deleteTestCase.bind(null, projectId, moduleId, tc.id)}
              >
                <button
                  type="submit"
                  className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
