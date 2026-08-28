import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import { SupportInboxClient } from "./SupportInboxClient";

// Section 14: agent-side inbox for the per-project customer support chat
// — a list of conversations (one per customer email) with a live chat
// panel for whichever one is selected.
export default async function SupportInboxPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: conversations }, member] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
    supabase
      .from("support_conversations")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    getCurrentMember(),
  ]);

  if (!project || !member) notFound();

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col">
      <h1 className="mb-4 text-xl font-semibold">Support — {project.name}</h1>
      <SupportInboxClient
        projectId={projectId}
        companyId={member.companyId}
        initialConversations={conversations ?? []}
        agentName={member.name}
      />
    </div>
  );
}
