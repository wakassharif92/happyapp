import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

// REQ-120: Issue Board, now backed by real data (qa-agent-spec.md Section
// 12/13) — projects and board_issues are fetched once here on the server;
// all interactivity (tab switching, project switching, the detail panel)
// lives client-side in DashboardClient, matching how every other
// server-component-fetches/client-component-interacts page in this app is
// split (e.g. app/reports/page.tsx + CategorySelect.tsx).
export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: issues }] = await Promise.all([
    supabase.from("projects").select("id, name").order("name", { ascending: true }),
    supabase.from("board_issues").select("*").order("created_at", { ascending: false }),
  ]);

  // Media paths are object keys in the private "whatsapp-media" bucket
  // (see app/api/slack/events/route.ts's comment on why that bucket, not
  // a new one) — resolve each to a short-lived signed URL here, same
  // pattern as app/reports/page.tsx.
  const issuesWithMedia = await Promise.all(
    (issues ?? []).map(async (issue) => {
      if (!issue.media_url) return issue;
      const { data } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(issue.media_url, 60 * 60);
      return { ...issue, media_url: data?.signedUrl ?? null };
    })
  );

  return <DashboardClient initialProjects={projects ?? []} initialIssues={issuesWithMedia} />;
}
