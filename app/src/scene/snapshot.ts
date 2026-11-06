// A share's picture (slice 8; ADR-0002 §1, Share): the scene's canvas as a frame just drew it, copied before the frame ends, as WebGL keeps no
// drawing buffer past it. Only the canvas: the page's text, the chat, a direct message and the labels are elements over it, never in it.

/** The widest a picture is, in pixels: a share's preview, not a print. */
const WIDEST = 1600;

/** A copy of `source` as it shows now, WIDEST wide at most; none where the browser gives no 2D context or the canvas has no size. */
export function copyOf(source: HTMLCanvasElement): HTMLCanvasElement | undefined {
  const scale = Math.min(1, WIDEST / Math.max(1, source.width));
  const copy = document.createElement("canvas");
  copy.width = Math.round(source.width * scale);
  copy.height = Math.round(source.height * scale);
  const context = copy.getContext("2d");
  if (context === null || copy.width === 0 || copy.height === 0) return undefined;
  context.drawImage(source, 0, 0, copy.width, copy.height);
  return copy;
}
