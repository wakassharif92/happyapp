import "server-only";
import type { Project } from "@/lib/types/database";
import type {
  ActionParams,
  ActionResponse,
  ActionType,
  BridgeErrorResponse,
  CreateSessionResponse,
  DomResponse,
  ScreenshotResponse,
} from "./types";

// REQ-090: this is the only module allowed to talk to the automation
// bridges, and only ever from server-side code (route handlers, agent
// loops) — never from a Client Component.

export class BridgeUnavailableError extends Error {
  constructor(appType: "mobile" | "web", cause?: unknown) {
    super(
      appType === "mobile"
        ? "Appium bridge/device not connected. Start the emulator and Appium server, then the mobile bridge (REQ-091)."
        : "Playwright bridge not reachable. Start it with `npm run bridge:playwright` (REQ-092)."
    );
    this.cause = cause;
  }
}

// REQ-000/REQ-091/REQ-092: for mobile, automation_target IS the bridge's own
// address; for web, automation_target is the app-under-test's base URL and
// the bridge itself lives at a fixed, separately-configured service address.
function getBridgeServiceUrl(
  project: Pick<Project, "app_type" | "automation_target">
): string {
  if (project.app_type === "mobile") {
    if (!project.automation_target) {
      throw new Error("Project has no automation_target (Appium bridge URL) configured.");
    }
    return project.automation_target;
  }
  return process.env.PLAYWRIGHT_BRIDGE_URL ?? "http://localhost:4001";
}

async function bridgeFetch<T>(
  project: Pick<Project, "app_type" | "automation_target">,
  path: string,
  init?: RequestInit
): Promise<T> {
  const serviceUrl = getBridgeServiceUrl(project);
  let res: Response;
  try {
    res = await fetch(`${serviceUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (err) {
    throw new BridgeUnavailableError(project.app_type, err);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as BridgeErrorResponse;
    throw new Error(body.error ?? `Bridge request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function createBridgeSession(
  project: Pick<Project, "app_type" | "automation_target">
): Promise<string> {
  const body =
    project.app_type === "web"
      ? { baseUrl: project.automation_target, headless: true }
      : {};
  const { sessionId } = await bridgeFetch<CreateSessionResponse>(
    project,
    "/session",
    { method: "POST", body: JSON.stringify(body) }
  );
  return sessionId;
}

export async function closeBridgeSession(
  project: Pick<Project, "app_type" | "automation_target">,
  sessionId: string
): Promise<void> {
  await bridgeFetch(project, `/session?sessionId=${sessionId}`, {
    method: "DELETE",
  });
}

export async function performAction(
  project: Pick<Project, "app_type" | "automation_target">,
  sessionId: string,
  type: ActionType,
  params?: ActionParams
): Promise<ActionResponse> {
  return bridgeFetch<ActionResponse>(project, "/action", {
    method: "POST",
    body: JSON.stringify({ sessionId, type, params }),
  });
}

export async function getScreenshot(
  project: Pick<Project, "app_type" | "automation_target">,
  sessionId: string
): Promise<string> {
  const { image } = await bridgeFetch<ScreenshotResponse>(
    project,
    `/screenshot?sessionId=${sessionId}`
  );
  return image;
}

export async function getDom(
  project: Pick<Project, "app_type" | "automation_target">,
  sessionId: string
): Promise<DomResponse> {
  return bridgeFetch<DomResponse>(project, `/dom?sessionId=${sessionId}`);
}

// REQ-091: lets the dashboard show a clear "device/bridge not connected"
// state proactively, rather than only surfacing it after a run fails.
export async function checkBridgeHealth(
  project: Pick<Project, "app_type" | "automation_target">
): Promise<{ ok: boolean; message?: string }> {
  if (project.app_type === "mobile" && !project.automation_target) {
    return { ok: false, message: "No Appium bridge URL configured (Project Settings)." };
  }
  const serviceUrl = getBridgeServiceUrl(project);
  try {
    const res = await fetch(serviceUrl, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return { ok: false, message: `Bridge responded with ${res.status}` };
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        project.app_type === "mobile"
          ? "Appium bridge not reachable — start the emulator, Appium server, and the mobile bridge (npm run bridge:appium)."
          : "Playwright bridge not reachable — start it with `npm run bridge:playwright`.",
    };
  }
}
