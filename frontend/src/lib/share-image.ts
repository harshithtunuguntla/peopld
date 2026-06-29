// Rasterize a DOM node to a PNG and share it — natively (the OS share sheet, with
// the image as a file) where supported, falling back to a plain download. Used by
// the post-event "story card" so an attendee can post their night in one tap.
//
// Reliability notes:
//   - `html-to-image` is imported dynamically, so it only loads when someone
//     actually shares (keeps it out of the main bundle).
//   - We await `document.fonts.ready` first so the display font is embedded, not
//     swapped for a fallback in the exported image.
//   - The card uses gradient/initials avatars (no external <img>), so the canvas
//     never tains and export can't silently fail on CORS.
//   - A user who dismisses the native sheet (AbortError) is not an error and must
//     NOT also trigger a download.

export type ShareResult = "shared" | "downloaded" | "cancelled";

const BRAND_INK = "#06060A"; // card background — keep PNG opaque, no transparent edges

export async function shareStoryCard(
  node: HTMLElement,
  opts: { fileName: string; title: string; text: string; forceDownload?: boolean },
): Promise<ShareResult> {
  // Make sure web fonts are loaded before we snapshot, or the export falls back
  // to a system font and looks off-brand.
  try {
    await document.fonts?.ready;
  } catch {
    /* fonts API unsupported — proceed; worst case a fallback font */
  }

  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    // 2× a 1080px design → ~2160px PNG: sharp enough to post, light enough to
    // upload from a phone without choking a low-end device.
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: BRAND_INK,
  });
  if (!blob) throw new Error("Couldn't render the card");

  const file = new File([blob], opts.fileName, { type: "image/png" });

  // Preferred path: native share sheet with the actual image file (unless the
  // caller explicitly wants a download, e.g. the dedicated Download button).
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (!opts.forceDownload && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: opts.title, text: opts.text });
      return "shared";
    } catch (e) {
      // User dismissed the sheet — respect that, don't force a download.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // Any other share failure → fall through to download so they still get it.
    }
  }

  // Fallback: download the PNG (desktop, or browsers without file share).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
