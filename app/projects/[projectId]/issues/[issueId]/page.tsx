import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/Badge";
import { ActivityFeed } from "@/components/ActivityFeed";
import type { AgentEvent } from "@/lib/types/database";

// REQ-072: issue detail — description, repro steps, evidence, tag +
// reasoning, status, and (if applicable) the linked fix run + re-verification.
export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}) {
  const { issueId } = await params;
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .maybeSingle();

  if (!issue) notFound();

  const [{ data: mod }, evidenceLinks, { data: triageEventsData }, fixRunResult] =
    await Promise.all([
      supabase.from("modules").select("name").eq("id", issue.module_id).maybeSingle(),
      Promise.all(
        issue.evidence_urls.map(async (path) => {
          const { data } = await supabase.storage
            .from("evidence")
            .createSignedUrl(path, 60 * 60);
          return { path, url: data?.signedUrl };
        })
      ),
      supabase
        .from("agent_events")
        .select("*")
        .eq("run_type", "issue_triage")
        .eq("run_id", issue.id)
        .order("created_at", { ascending: true }),
      issue.assigned_agent_run_id
        ? Promise.all([
            supabase
              .from("programming_agent_runs")
              .select("id, status, summary, completed_at")
              .eq("id", issue.assigned_agent_run_id)
              .maybeSingle(),
            supabase
              .from("agent_events")
              .select("*")
              .eq("run_type", "fix_run")
              .eq("run_id", issue.assigned_agent_run_id)
              .order("created_at", { ascending: true }),
          ])
        : null,
    ]);

  const triageEvents = triageEventsData ?? [];
  const fixRun = fixRunResult ? fixRunResult[0].data : null;
  const fixEvents: AgentEvent[] = fixRunResult ? (fixRunResult[1].data ?? []) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{issue.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mod?.name ?? "—"} · {issue.source} ·{" "}
          {new Date(issue.created_at).toLocaleString()}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Badge value={issue.tag} />
          <Badge value={issue.status} />
          {issue.severity && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {issue.severity} severity
            </span>
          )}
        </div>
      </div>

      {issue.description && (
        <Section title="Description">
          <p className="whitespace-pre-wrap text-sm">{issue.description}</p>
        </Section>
      )}

      {issue.reproduction_steps.length > 0 && (
        <Section title="Reproduction steps">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {issue.reproduction_steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Section>
      )}

      {evidenceLinks.length > 0 && (
        <Section title="Evidence">
          <div className="flex flex-wrap gap-3">
            {evidenceLinks.map(
              ({ path, url }) =>
                url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={path}
                    src={url}
                    alt="Evidence screenshot"
                    className="h-32 rounded-lg border border-slate-200 object-cover shadow-sm"
                  />
                )
            )}
          </div>
        </Section>
      )}

      {issue.tag_reasoning && (
        <Section title="QA Agent reasoning">
          <p className="whitespace-pre-wrap text-sm">{issue.tag_reasoning}</p>
        </Section>
      )}

      {(issue.status === "investigating" || triageEvents.length > 0) && (
        <Section title="Triage activity">
          <ActivityFeed runId={issue.id} initialEvents={triageEvents} />
        </Section>
      )}

      {fixRun && (
        <Section title="Fix run">
          <div className="flex items-center gap-2 text-sm">
            <Badge value={fixRun.status} />
            {fixRun.completed_at && (
              <span className="text-slate-500">
                completed {new Date(fixRun.completed_at).toLocaleString()}
              </span>
            )}
          </div>
          {fixRun.summary && (
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {fixRun.summary}
            </p>
          )}
          {(fixRun.status === "running" || fixEvents.length > 0) && (
            <div className="mt-3">
              <ActivityFeed runId={fixRun.id} initialEvents={fixEvents} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-slate-500">{title}</h2>
      {children}
    </div>
  );
}
