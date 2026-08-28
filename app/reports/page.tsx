import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CategorySelect } from "./CategorySelect";
import { Badge } from "@/components/Badge";

// REQ-112: unified report inbox — everything a team member sends via
// WhatsApp (REQ-110) or the public web form (REQ-116), newest first. Plain
// list, no AI.
export default async function TeamReportsPage() {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const reportFormUrl = host ? `${protocol}://${host}/team-report` : "/team-report";

  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("team_reports")
    .select("*")
    .order("received_at", { ascending: false });

  const projectIds = [...new Set((reports ?? []).map((r) => r.project_id).filter((id): id is string => id !== null))];
  const { data: projects } =
    projectIds.length > 0
      ? await supabase.from("projects").select("id, name").in("id", projectIds)
      : { data: [] };
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  const withImages = await Promise.all(
    (reports ?? []).map(async (report) => {
      const projectName = report.project_id ? (projectNameById.get(report.project_id) ?? null) : null;
      if (!report.image_path) return { ...report, projectName, imageUrl: null };
      const { data } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(report.image_path, 60 * 60);
      return { ...report, projectName, imageUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Team Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Share this link with your team so they can report issues without an account:{" "}
          <span className="font-medium text-slate-700 break-all">{reportFormUrl}</span>
        </p>
      </div>

      {withImages.length === 0 ? (
        <p className="text-sm text-slate-500">
          No reports yet — messages sent via WhatsApp or the report form will show up here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {withImages.map((report) => (
            <li key={report.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {report.sender_name || report.sender_phone || "Anonymous"}
                    </span>
                    <Badge value={report.source} />
                    {report.projectName && <Badge value={report.projectName} />}
                    {!report.projectName && report.other_project_name && (
                      <Badge value={report.other_project_name} />
                    )}
                  </div>
                  {report.page_name && (
                    <span className="text-xs font-medium text-slate-500">
                      Page: {report.page_name}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {new Date(report.received_at).toLocaleString()}
                  </span>
                </div>
                <CategorySelect reportId={report.id} category={report.category} />
              </div>
              {report.message_text && (
                <p className="text-sm text-slate-700">{report.message_text}</p>
              )}
              {report.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.imageUrl}
                  alt="Attached to report"
                  className="max-h-80 w-fit rounded-lg border border-slate-200 object-contain"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
