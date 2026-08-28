import type { MediaType } from "@/lib/board/types";
import { IconImage, IconPaperclip, IconPlay } from "./icons";

export function Thumbnail({
  mediaType,
  color,
  mediaUrl = null,
  size = "md",
}: {
  mediaType: MediaType;
  color: string;
  mediaUrl?: string | null;
  size?: "md" | "lg";
}) {
  const dims = size === "lg" ? "h-40 w-full sm:h-56" : "h-14 w-14";

  if (mediaType === "none") {
    return (
      <div
        className={`flex ${dims} shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--db-border-strong)] bg-[var(--db-surface-2)] text-[var(--db-fg-subtle)]`}
      >
        <IconPaperclip className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
      </div>
    );
  }

  // Real media (e.g. a Slack attachment) — shown in full in the large
  // detail-panel size; card-row thumbnails stay icon-only even when a
  // real file exists, to keep the list scannable rather than turning it
  // into an image grid.
  if (mediaUrl && size === "lg") {
    return mediaType === "video" ? (
      <video
        src={mediaUrl}
        controls
        className={`${dims} shrink-0 rounded-lg bg-black object-contain`}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mediaUrl}
        alt="Attached to issue"
        className={`${dims} shrink-0 rounded-lg object-contain`}
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center rounded-lg text-white/90`}
      style={{ backgroundColor: color }}
    >
      {mediaType === "video" ? (
        <IconPlay className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} />
      ) : (
        <IconImage className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </div>
  );
}
