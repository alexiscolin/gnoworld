// The system's word, asked as "no preference": a browser that cannot answer it is calm (the tests' matchMedia answers no to every query).
const WELCOME = "(prefers-reduced-motion: no-preference)";

/** Whether neither the system's reduced-motion word nor this device's "Reduce animations" setting (the root's `data-motion`) asks for
 * calm. */
export function motionAsked(): boolean {
  return matchMedia(WELCOME).matches && document.documentElement.dataset["motion"] !== "reduce";
}

/** Whether motion is welcome: as `motionAsked`, and the motion scale, which the tokens zero at either word, is not 0. */
export function motionWelcome(): boolean {
  return motionAsked() && getComputedStyle(document.documentElement).getPropertyValue("--motion-scale").trim() !== "0";
}

/** Calls `changed` when the system's word or this device's setting changes. Returns what stops it. */
export function watchMotion(changed: () => void): () => void {
  const media = matchMedia(WELCOME);
  const root = new MutationObserver(changed);
  media.addEventListener("change", changed);
  root.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    media.removeEventListener("change", changed);
    root.disconnect();
  };
}
