import { createClient } from "@/lib/supabase/server";
import { ReportForm } from "./ReportForm";
import { reportIssue } from "./actions";

// REQ-020: report an issue in plain language; it lands in the central
// Issues table untriaged (tag = null) until Investigate is triggered.
export default async function ReportIssuePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("modules")
    .select("id, name")
    .eq("project_id", projectId)
    .order("name");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Report Issue</h1>
      {!modules || modules.length === 0 ? (
        <p className="text-sm text-slate-500">
          Add a module first before reporting an issue.
        </p>
      ) : (
        <ReportForm
          modules={modules}
          action={reportIssue.bind(null, projectId)}
        />
      )}
    </div>
  );
}
