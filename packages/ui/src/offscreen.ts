// A beat or a breath out of sight is paused: any running animation keeps the screen redrawn, seen or not. The node gets `--play`, which a rule
// reads as its `animation-play-state`; a hidden tab the browser already stops.
let shared: IntersectionObserver | undefined;

/** Pauses the animations that read `--play` on `node` while it is out of view. Returns what lets it go. */
export function pauseOffscreen(node: HTMLElement | SVGElement): () => void {
  if (typeof IntersectionObserver === "undefined") return () => undefined;
  shared ??= new IntersectionObserver((rows) => {
    for (const { target, isIntersecting } of rows)
      if (target instanceof HTMLElement || target instanceof SVGElement)
        target.style.setProperty("--play", isIntersecting ? "running" : "paused");
  });
  const watch = shared;
  watch.observe(node);
  return () => {
    watch.unobserve(node);
  };
}

/** A ref for an element whose animation pauses out of view. */
export const sightRef = (node: HTMLElement | SVGElement | null): (() => void) | undefined =>
  node === null ? undefined : pauseOffscreen(node);

/** Calls `go` once, the first time `node` is seen in `root` (the page's, when none), at `threshold` of it. Returns what lets it go. */
export function onceSeen(
  node: Element,
  { root, threshold = 0 }: { root: Element | null; threshold?: number },
  go: () => void,
): () => void {
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watch.disconnect();
      go();
    },
    { root, threshold },
  );
  watch.observe(node);
  return () => {
    watch.disconnect();
  };
}
