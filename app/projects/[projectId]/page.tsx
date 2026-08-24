import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { FixBatchTrigger } from "./FixBatchTrigger";
import { BridgeStatusBadge } from "@/components/BridgeStatusBadge";
import { ProgressBar } from "@/components/ProgressBar";
import { CostSummary, type CostBreakdownRow } from "@/components/CostSummary";
import type { AgentOperation } from "@/lib/types/database";

// REQ-073: dashboard overview — open bugs, approval queue count, recent
// runs, live counts as numbers + progress bars.
export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: modules }, { data: apiCalls }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("modules").select("id").eq("project_id", projectId),
    supabase
      .from("agent_api_calls")
      .select("operation, cost_usd, input_tokens, output_tokens")
      .eq("project_id", projectId),
  ]);
  const moduleIds = (modules ?? []).map((m) => m.id);

  const costByOperation = new Map<AgentOperation, CostBreakdownRow>();
  for (const call of apiCalls ?? []) {
    const key = call.operation;
    const existing = costByOperation.get(key) ?? {
      operation: key,
      costUsd: 0,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    existing.costUsd += call.cost_usd;
    existing.calls += 1;
    existing.inputTokens += call.input_tokens;
    existing.outputTokens += call.output_tokens;
    costByOperation.set(key, existing);
  }
  const costRows = Array.from(costByOperation.values());

  let openBugs = 0;
  let needsTriageCount = 0;
  let approvalCount = 0;
  let fixedCount = 0;
  let verifiedCount = 0;
  let readyToFixCount = 0;
  let totalTestCases = 0;
  let passedTestCases = 0;
  let failedTestCases = 0;
  let recentRuns: {
    id: string;
    module_id: string;
    status: string;
    started_at: string;
    passed_count: number;
    failed_count: number;
    total_cases: number;
  }[] = [];

  if (moduleIds.length > 0) {
    const [
      openBugsRes,
      needsTriageRes,
      approvalRes,
      fixedRes,
      verifiedRes,
      readyToFixRes,
      testCaseCountRes,
      passedCasesRes,
      failedCasesRes,
      runsRes,
    ] = await Promise.all([
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("tag", "bug")
        .not("status", "in", "(verified,closed)"),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .is("tag", null),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("tag", "approval"),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("status", "fixed"),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("status", "verified"),
      supabase
        .from("issues")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("tag", "bug")
        .eq("status", "triaged"),
      supabase
        .from("test_cases")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds),
      supabase
        .from("test_cases")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("status", "pass"),
      supabase
        .from("test_cases")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
        .eq("status", "fail"),
      supabase
        .from("test_runs")
        .select(
          "id, module_id, status, started_at, passed_count, failed_count, total_cases"
        )
        .in("module_id", moduleIds)
        .order("started_at", { ascending: false })
        .limit(5),
    ]);

    openBugs = openBugsRes.count ?? 0;
    needsTriageCount = needsTriageRes.count ?? 0;
    approvalCount = approvalRes.count ?? 0;
    fixedCount = fixedRes.count ?? 0;
    verifiedCount = verifiedRes.count ?? 0;
    readyToFixCount = readyToFixRes.count ?? 0;
    totalTestCases = testCaseCountRes.count ?? 0;
    passedTestCases = passedCasesRes.count ?? 0;
    failedTestCases = failedCasesRes.count ?? 0;
    recentRuns = runsRes.data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        {project?.automation_target && (
          <Suspense
            fallback={
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-slate-300" />
                Checking bridge…
              </div>
            }
          >
            <BridgeStatusBadge project={project} />
          </Suspense>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        <StatTile label="Open bugs" value={openBugs} />
        <StatTile
          label="Needs triage"
          value={needsTriageCount}
          href={`/projects/${projectId}/issues?tag=untriaged`}
        />
        <StatTile
          label="Needs approval"
          value={approvalCount}
          href={`/projects/${projectId}/approval`}
        />
        <StatTile label="Fixed (unverified)" value={fixedCount} />
        <StatTile label="Verified fixes" value={verifiedCount} />
      </div>

      <CostSummary rows={costRows} />

      {totalTestCases > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Test cases</span>
            <span className="text-slate-500">
              {passedTestCases}/{totalTestCases} passed, {failedTestCases} failed
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar passed={passedTestCases} failed={failedTestCases} total={totalTestCases} />
          </div>
        </div>
      )}

      {readyToFixCount > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-slate-500">
            {readyToFixCount} triaged bug{readyToFixCount === 1 ? "" : "s"} ready to fix
          </h2>
          <FixBatchTrigger projectId={projectId} />
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-slate-500">
          Recent test runs
        </h2>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-slate-500">
            No test runs yet. Head to Modules to sync from your requirements
            doc, then Automated Testing to generate and run test cases.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
            {recentRuns.map((run) => (
              <li key={run.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="capitalize">{run.status}</span>
                  <span className="text-slate-500">
                    {run.passed_count}/{run.total_cases} passed,{" "}
                    {run.failed_count} failed
                  </span>
                  <span className="text-slate-400">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                </div>
                <ProgressBar
                  passed={run.passed_count}
                  failed={run.failed_count}
                  total={run.total_cases}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </>
  );
  const className =
    "card p-4 transition-colors" + (href ? " hover:border-indigo-300" : "");

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
