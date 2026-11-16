// The full chat on a phone is as tall as the visual viewport: iOS Safari and Chrome (since 108) leave the layout viewport, and so `dvh`,
// whole under the on-screen keyboard, which would cover the composer. The screen's CSS reads these two properties and falls back to
// `100dvb` where they are unset (ChatScreen.module.css).
import { useEffect, type RefObject } from "react";

/** The screen's two properties: the visual viewport's height and how far it is scrolled from the layout viewport's top. */
export function viewportVars({ height, offsetTop }: Pick<VisualViewport, "height" | "offsetTop">) {
  return { "--chat-vh": `${String(height)}px`, "--chat-vtop": `${String(offsetTop)}px` };
}

/** Keeps `box`'s properties at the visual viewport's, now and at each resize or scroll, until `signal` aborts (then unset). */
export function followViewport(
  box: HTMLElement,
  viewport: Pick<VisualViewport, "height" | "offsetTop" | "addEventListener"> | null,
  signal: AbortSignal,
) {
  if (viewport === null) return;
  const set = () => {
    for (const [name, value] of Object.entries(viewportVars(viewport))) box.style.setProperty(name, value);
  };
  set();
  viewport.addEventListener("resize", set, { signal });
  viewport.addEventListener("scroll", set, { signal });
  signal.addEventListener("abort", () => {
    box.style.removeProperty("--chat-vh");
    box.style.removeProperty("--chat-vtop");
  });
}

/** The screen sized to the visual viewport while `on` (a phone's full chat). */
export function useViewport(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const box = ref.current;
    if (!on || box === null) return;
    const stop = new AbortController();
    followViewport(box, window.visualViewport, stop.signal);
    return () => {
      stop.abort();
    };
  }, [ref, on]);
}
