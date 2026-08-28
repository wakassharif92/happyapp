import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/company";
import { DocumentsClient } from "./DocumentsClient";

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: documents }, member] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
    supabase
      .from("documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    getCurrentMember(),
  ]);

  if (!project || !member) notFound();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">Reference links for {project.name}.</p>
      </div>

      <DocumentsClient projectId={projectId} documents={documents ?? []} isAdmin={member.isAdmin} />
    </div>
  );
}
