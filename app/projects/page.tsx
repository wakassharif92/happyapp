import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// REQ-071: selecting a project scopes the whole dashboard to it via the URL.
// This route just picks where to land: straight into the only/most-recent
// project, or into the Add Project flow if none exist yet.
export default async function ProjectsIndexPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1);

  if (!projects || projects.length === 0) {
    redirect("/projects/new");
  }

  redirect(`/projects/${projects[0].id}`);
}
