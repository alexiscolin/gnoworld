// The settings take effect at once: each one marked on the page's root, where the stylesheets read reduced motion and the scene,
// in its own chunk, reads the quality and the motion, with no module shared between the first screen and the scene.
import { useEffect } from "react";
import { useApp } from "../../storeContext.tsx";

/** Marks the root with the settings, again as they change. */
export function useSettingsApplied(): void {
  const { quality, calm } = useApp(({ device }) => device.settings);
  useEffect(() => {
    const { dataset } = document.documentElement;
    if (calm) dataset["motion"] = "reduce";
    else delete dataset["motion"];
    if (quality === "auto") delete dataset["quality"];
    else dataset["quality"] = quality;
  }, [quality, calm]);
}
