// The key of space's views, heard while the header's ways stand (shellWays.tsx): V toggles the Map, space seen from above (D433).
import { useEffect } from "react";
import { keyHeld } from "../../space/keyHeld.ts";
import { toggleMap } from "../../mapView.ts";

/** V, heard while `active`. */
export function useViewKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        const chord = event.metaKey || event.ctrlKey || event.altKey;
        if (event.key.toLowerCase() !== "v" || chord || event.defaultPrevented || keyHeld(event)) return;
        toggleMap();
      },
      { signal: controller.signal },
    );
    return () => {
      controller.abort();
    };
  }, [active]);
}
