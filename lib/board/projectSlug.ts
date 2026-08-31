// Vanity project links: "https://…/report/acme-app-6b351396-…" instead of
// a bare UUID, purely so a copied/shared link is recognizable at a
// glance — the trailing UUID is always what's actually looked up, the
// slug in front is decorative and never parsed for meaning. Old
// bare-UUID links (shared before this existed) keep working unchanged,
// since a bare UUID is itself a valid match for the trailing-UUID regex.

const TRAILING_UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pulls the real project id back out of a `/report/[routeParam]` or
// `/support/[routeParam]` segment, whether or not it has a slug prefix.
export function extractProjectId(routeParam: string): string {
  const match = routeParam.match(TRAILING_UUID_RE);
  return match ? match[0] : routeParam;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Builds the route segment used when generating a shareable link
// (LinksCard.tsx) — pairs with extractProjectId() above.
export function projectSlugPath(projectId: string, projectName: string): string {
  const slug = slugify(projectName);
  return slug ? `${slug}-${projectId}` : projectId;
}
