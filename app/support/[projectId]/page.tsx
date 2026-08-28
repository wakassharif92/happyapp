import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupportChatClient } from "./SupportChatClient";

// Section 14: the "Customer Support" per-project link — opened from
// inside the client's own mobile app (a deep link/button), which passes
// the customer's already-logged-in email as ?email=. No email means this
// wasn't opened from the app, so it's blocked rather than falling back to
// a manual name/email prompt (confirmed with the user).
export default async function SupportChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { projectId } = await params;
  const { email } = await searchParams;

  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) notFound();

  if (!email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-slate-900">
          Please open this from the app
        </p>
        <p className="max-w-xs text-sm text-slate-500">
          This support chat link needs to be opened from inside the app so we know who&apos;s
          messaging.
        </p>
      </div>
    );
  }

  return (
    <SupportChatClient projectId={projectId} projectName={project.name} email={email} />
  );
}
