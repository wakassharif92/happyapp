import "server-only";

// REQ-014: in-memory stop signal for in-progress test runs. Works because
// the run loop is a detached async function inside the same Node process
// that started it (see the "local machine" deployment model, REQ-090) — no
// job queue involved.
const stopRequests = new Set<string>();

export function requestStop(runId: string): void {
  stopRequests.add(runId);
}

export function isStopRequested(runId: string): boolean {
  return stopRequests.has(runId);
}

export function clearStop(runId: string): void {
  stopRequests.delete(runId);
}
