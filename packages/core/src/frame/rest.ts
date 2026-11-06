// A view at rest (slice 7d6): where the eye rests and the systems it draws whole as postcards. The home's is the Earth's view, its eye fixed
// (part 7x2; Alexis, 2026-11-04), with none; a system's arrival is one postcard.
import type { Point } from "../space/cell.ts";
import { REST_DISTANCE } from "./disc.ts";

export { FIELD_OF_VIEW, HERO_ZONE, REST_SCREENS, STAR_HEART } from "./restLook.ts";
export { REST_DISTANCE };

export interface RestView {
  /** Where the eye rests, on the map. */
  readonly eye: Point;
  /** The systems drawn whole, by their index. */
  readonly postcards: readonly number[];
}
