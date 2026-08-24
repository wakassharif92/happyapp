import { checkBridgeHealth } from "@/lib/bridge/client";
import type { Project } from "@/lib/types/database";

// REQ-091: "an unavailable bridge should surface a clear 'device not
// connected' state on the dashboard rather than silently failing."
export async function BridgeStatusBadge({
  project,
}: {
  project: Pick<Project, "app_type" | "automation_target">;
}) {
  const health = await checkBridgeHealth(project);
  const label = project.app_type === "mobile" ? "Appium bridge" : "Playwright bridge";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        health.ok
          ? "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400"
          : "border-red-200 text-red-700 dark:border-red-900 dark:text-red-400"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${health.ok ? "bg-emerald-500" : "bg-red-500"}`}
      />
      <span>{health.ok ? `${label} connected` : health.message}</span>
    </div>
  );
}
