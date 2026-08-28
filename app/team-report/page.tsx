import { createAdminClient } from "@/lib/supabase/admin";
import { TeamReportForm } from "./TeamReportForm";
import { submitReport } from "./actions";

// REQ-116: public, no-login report form. Uses the admin client to read the
// project list — an anonymous visitor's own client couldn't (projects RLS
// requires auth.uid()), and only {id, name} pairs ever reach the browser.
export default async function TeamReportPage() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold">Report an issue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Found something broken? Let us know — no login needed.
        </p>
      </div>
      <TeamReportForm projects={projects ?? []} action={submitReport} />
    </div>
  );
}
