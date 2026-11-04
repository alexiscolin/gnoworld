// Share a place (ADR-0002 §1, Share; slice 8): the sheet comes in a chunk of its own at the first press, so the first screen holds this alone.
import type { SharedPlace } from "./link.ts";

/** Opens the share sheet for `place`. */
export function sharePlace(place: SharedPlace): void {
  import("./ShareSheet.tsx").then(({ openShare }) => {
    openShare(place);
  }, reportError);
}
