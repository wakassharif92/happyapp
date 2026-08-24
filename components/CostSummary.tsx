import type { AgentOperation } from "@/lib/types/database";

const OPERATION_LABELS: Record<AgentOperation, string> = {
  module_sync: "Module sync",
  test_case_generation: "Test case generation",
  test_run: "Automated testing",
  issue_triage: "Issue triage",
  fix_run: "Fix it",
  verify_fix: "Fix verification",
};

export type CostBreakdownRow = {
  operation: AgentOperation;
  costUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// REQ-agnostic addition: per-category Claude API cost, so the team can see
// what automated testing / QA triage / fix-it runs are actually costing.
export function CostSummary({ rows }: { rows: CostBreakdownRow[] }) {
  const totalCost = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const totalCalls = rows.reduce((sum, r) => sum + r.calls, 0);

  if (totalCalls === 0) {
    return (
      <div className="card p-4">
        <h2 className="text-sm font-medium text-slate-500">API cost</h2>
        <p className="mt-2 text-sm text-slate-500">
          No agent activity yet — cost will appear here once modules are
          synced, tests are run, or issues are triaged/fixed.
        </p>
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.costUsd - a.costUsd);

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-500">API cost</h2>
        <span className="text-lg font-semibold text-slate-900">
          {formatCost(totalCost)}
        </span>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-slate-100">
        {sorted.map((row) => (
          <li
            key={row.operation}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span className="text-slate-700">
              {OPERATION_LABELS[row.operation]}
            </span>
            <span className="flex items-center gap-3 text-slate-500">
              <span className="text-xs">
                {row.calls} call{row.calls === 1 ? "" : "s"} ·{" "}
                {formatTokens(row.inputTokens + row.outputTokens)} tokens
              </span>
              <span className="w-16 text-right font-medium text-slate-900">
                {formatCost(row.costUsd)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
