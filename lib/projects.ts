import type { Project } from "@/lib/types/database";

// REQ-074: no project is usable for testing until these are set.
export function isProjectReady(project: Project): boolean {
  return Boolean(project.automation_target && project.codebase_path);
}

export const FRAMEWORK_OPTIONS_BY_APP_TYPE: Record<string, string[]> = {
  mobile: ["flutter", "react_native", "native"],
  web: ["react", "nextjs", "vue", "native"],
};
