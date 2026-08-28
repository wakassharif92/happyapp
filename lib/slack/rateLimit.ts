import "server-only";

// In-memory sliding-window limiter, keyed by Slack team_id. Deliberately
// not Redis-backed: this app runs as a single long-lived Node process
// (see PROGRESS.md — the automation bridges rely on the same assumption),
// not multiple serverless instances, so a per-process Map is a real,
// correct limiter here, not just a toy — it resets on restart, which is
// fine for "reasonable" abuse protection on an internal tool.
const WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 20;

const hits = new Map<string, number[]>();

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(key, timestamps);
  return timestamps.length > MAX_EVENTS_PER_WINDOW;
}
