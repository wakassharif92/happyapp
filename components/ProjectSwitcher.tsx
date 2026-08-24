"use client";

import { useRouter } from "next/navigation";

type SwitcherProject = { id: string; name: string; app_type: string };

export function ProjectSwitcher({
  projects,
  currentProjectId,
}: {
  projects: SwitcherProject[];
  currentProjectId: string;
}) {
  const router = useRouter();

  return (
    <select
      value={currentProjectId}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          router.push("/projects/new");
        } else {
          router.push(`/projects/${e.target.value}`);
        }
      }}
      className="input font-medium"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.app_type})
        </option>
      ))}
      <option value="__new__">+ Add Project</option>
    </select>
  );
}
