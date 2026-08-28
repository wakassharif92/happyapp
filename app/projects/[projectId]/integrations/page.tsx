import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IntegrationsClient } from "./IntegrationsClient";

// REQ-126–131: per-project Slack connection management. Only slack_
// connections' non-secret columns are ever sent to the client — the
// encrypted access_token never leaves the server. Not linked from the
// sidebar (kept off by request, same "hide, don't delete" pattern as the
// old QA Agent nav) — still fully reachable at this URL directly, e.g. to
// reconnect or change the Slack channel later.
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: connection }] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
    supabase
      .from("slack_connections")
      .select("id, team_name, channel_name, status, connected_by, created_at")
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  if (!project) notFound();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect Slack for {project.name} — messages posted in the connected channel
          automatically become issues in the Pending tab of the Issue Board.
        </p>
      </div>

      <IntegrationsClient projectId={projectId} initialConnection={connection ?? null} />
    </div>
  );
}
