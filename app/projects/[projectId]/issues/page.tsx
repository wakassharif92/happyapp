import { createClient } from "@/lib/supabase/server";
import { IssueRow } from "./IssueRow";
import { BulkInvestigateBar } from "./BulkInvestigateBar";
import type { IssueSource, IssueStatus, IssueTag } from "@/lib/types/database";

// All Issues — filterable table: module, tag, status, source (REQ-071).
// "untriaged" is a synthetic tag filter (tag IS NULL) doubling as the
// "Needs Triage" queue from REQ-021.
export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    module_id?: string;
    tag?: string;
    status?: string;
    source?: string;
  }>;
}) {
  const { projectId } = await params;
  const filters = await searchParams;
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, name")
    .eq("project_id", projectId)
    .order("name");
  const moduleIds = (modules ?? []).map((m) => m.id);
  const moduleNameById = new Map((modules ?? []).map((m) => [m.id, m.name]));

  let issues: {
    id: string;
    title: string;
    module_id: string;
    tag: string | null;
    status: string;
    severity: string | null;
    source: string;
    created_at: string;
  }[] = [];

  if (moduleIds.length > 0) {
    let query = supabase
      .from("issues")
      .select("id, title, module_id, tag, status, severity, source, created_at")
      .in("module_id", filters.module_id ? [filters.module_id] : moduleIds)
      .order("created_at", { ascending: false });

    if (filters.tag === "untriaged") query = query.is("tag", null);
    else if (filters.tag) query = query.eq("tag", filters.tag as IssueTag);
    if (filters.status) query = query.eq("status", filters.status as IssueStatus);
    if (filters.source) query = query.eq("source", filters.source as IssueSource);

    const { data } = await query;
    issues = data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">All Issues</h1>

      <form className="flex flex-wrap gap-3" method="get">
        <select name="module_id" defaultValue={filters.module_id ?? ""} className="input w-auto">
          <option value="">All modules</option>
          {(modules ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select name="tag" defaultValue={filters.tag ?? ""} className="input w-auto">
          <option value="">All tags</option>
          <option value="untriaged">Needs triage</option>
          {["bug", "not_a_bug", "approval", "fixed", "verified"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filters.status ?? ""} className="input w-auto">
          <option value="">All statuses</option>
          {[
            "new",
            "investigating",
            "triaged",
            "fixing",
            "fixed",
            "verified",
            "closed",
          ].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} className="input w-auto">
          <option value="">All sources</option>
          <option value="automated">automated</option>
          <option value="manual">manual</option>
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Filter
        </button>
      </form>

      {filters.tag === "untriaged" &&
        issues.some((i) => i.status !== "investigating") && (
          <BulkInvestigateBar
            issueIds={issues.filter((i) => i.status !== "investigating").map((i) => i.id)}
          />
        )}

      {issues.length === 0 ? (
        <p className="text-sm text-slate-500">No issues match these filters.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {issues.map((issue) => (
            <li key={issue.id}>
              <IssueRow
                projectId={projectId}
                issue={issue}
                moduleName={moduleNameById.get(issue.module_id) ?? "—"}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
