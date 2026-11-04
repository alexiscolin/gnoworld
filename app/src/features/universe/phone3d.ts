// The settings' "Space in 3D on a phone" (slice 8), as the page marks it on the root: a phone offered "View in space" loads it at once
// when the setting is on, or as soon as it is turned on, with no reload.

const on = () => document.documentElement.dataset["phone3d"] === "on";

/** Calls `go` once, now if the settings ask for space on a phone, else when they turn it on, until `signal` aborts. */
export function whenPhone3d(go: () => void, signal: AbortSignal): void {
  if (on()) {
    go();
    return;
  }
  const marks = new MutationObserver(() => {
    if (!on()) return;
    marks.disconnect();
    go();
  });
  marks.observe(document.documentElement, { attributes: true, attributeFilter: ["data-phone3d"] });
  signal.addEventListener("abort", () => {
    marks.disconnect();
  });
}
