// The scene's quality as the settings chose it (slice 8): the page marks it on the root, High or Low, and none for Auto; the scene reads it
// there, in its own chunk, and follows its changes with no reload.
import type { Tier } from "@gnoworld/core";

/** The tier the settings chose, none for Auto. */
export function chosenTier(): Tier | undefined {
  const quality = document.documentElement.dataset["quality"];
  return quality === "high" || quality === "low" ? quality : undefined;
}

/** The tier the scene draws at: the settings' choice, else the one Auto found. */
export const tierOf = (auto: Tier): Tier => chosenTier() ?? auto;

/** Calls `changed` each time the settings choose another quality, until `signal` aborts. */
export function watchQuality(changed: () => void, signal: AbortSignal): void {
  const marks = new MutationObserver(changed);
  marks.observe(document.documentElement, { attributes: true, attributeFilter: ["data-quality"] });
  signal.addEventListener("abort", () => {
    marks.disconnect();
  });
}
