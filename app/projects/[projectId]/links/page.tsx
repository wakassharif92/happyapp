import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LinksCard } from "./LinksCard";

// Section 14: dedicated home for the two shareable per-project links —
// kept separate from /integrations (Slack settings) so they're always
// reachable from the sidebar even with Integrations hidden from nav.
export default async function LinksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) notFound();

  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const origin = host ? `${protocol}://${host}` : "";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Links</h1>
        <p className="mt-1 text-sm text-slate-500">
          Shareable, no-login links for {project.name}.
        </p>
      </div>

      <LinksCard
        supportLinkBase={`${origin}/support/${projectId}`}
        reportLink={`${origin}/report/${projectId}`}
      />
    </div>
  );
}
