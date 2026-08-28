// Client-side only (reads navigator) — detects the visiting device's
// platform so file-input behavior (ChatWindow.tsx's image attach button)
// can branch per platform. "web" here means "no reliable mobile signal
// found" — covers desktop browsers and any mobile UA that doesn't match
// the iOS/Android patterns below.
export type Platform = "ios" | "android" | "web";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;

  // iPadOS 13+ reports as "Macintosh" with touch support — the classic
  // iPhone/iPad/iPod UA check alone misses those, so the touch-point check
  // catches modern iPads too.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";

  if (/Android/.test(ua)) return "android";

  return "web";
}
