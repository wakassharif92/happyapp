export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const THUMB_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
  "#eab308",
];

// Real issue rows have no stored "theme color" — derived deterministically
// from the id instead, so a given issue's placeholder thumbnail stays the
// same color across reloads without needing a DB column for it.
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return THUMB_COLORS[Math.abs(hash) % THUMB_COLORS.length];
}
