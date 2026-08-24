import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolveApproval } from "./actions";

// REQ-052: dedicated view for tag = 'approval' items — these need a human
// decision, not further agent action.
export default async function ApprovalQueuePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, name")
    .eq("project_id", projectId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  const moduleNameById = new Map((modules ?? []).map((m) => [m.id, m.name]));

  const { data: issues } =
    moduleIds.length > 0
      ? await supabase
          .from("issues")
          .select("*")
          .in("module_id", moduleIds)
          .eq("tag", "approval")
          .order("created_at", { ascending: false })
      : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Approval Queue</h1>

      {!issues || issues.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nothing needs your review right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/projects/${projectId}/issues/${issue.id}`}
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {issue.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {moduleNameById.get(issue.module_id) ?? "—"} ·{" "}
                    {issue.source}
                  </p>
                </div>
              </div>

              {issue.tag_reasoning && (
                <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                  {issue.tag_reasoning}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <form
                  action={resolveApproval.bind(
                    null,
                    projectId,
                    issue.id,
                    "bug"
                  )}
                >
                  <button
                    type="submit"
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Mark as bug
                  </button>
                </form>
                <form
                  action={resolveApproval.bind(
                    null,
                    projectId,
                    issue.id,
                    "not_a_bug"
                  )}
                >
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Not a bug
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
