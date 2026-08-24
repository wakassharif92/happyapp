import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddModuleForm } from "./AddModuleForm";
import { SyncModulesButton } from "./SyncModulesButton";
import { createModule, deleteModule } from "./actions";

// REQ-010/REQ-071: Modules admin — manual CRUD plus AI sync from the
// project's requirements doc.
export default async function ModulesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: modules } = await supabase
    .from("modules")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Modules</h1>
        <SyncModulesButton projectId={projectId} />
      </div>

      <AddModuleForm action={createModule.bind(null, projectId)} />

      {!modules || modules.length === 0 ? (
        <p className="text-sm text-slate-500">
          No modules yet. Add one manually above, or sync from your
          requirements doc once available.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
          {modules.map((mod) => (
            <li
              key={mod.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <Link
                  href={`/projects/${projectId}/testing/${mod.id}`}
                  className="text-sm font-medium underline-offset-2 hover:underline"
                >
                  {mod.name}
                </Link>
                {mod.requirement_ref && (
                  <p className="text-xs text-slate-500">
                    {mod.requirement_ref}
                  </p>
                )}
                {mod.description && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {mod.description}
                  </p>
                )}
              </div>
              <form action={deleteModule.bind(null, projectId, mod.id)}>
                <button
                  type="submit"
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
