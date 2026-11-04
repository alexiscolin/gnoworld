// The files under public/textures each row of CREDITS credits, with no extension, in its order: only the credits' test reads them, so the
// first screen, which shows the rows, never ships the names (Alexis, 2026-11-04, for 7x's scenery maps).
import { CREDITS, type Credit } from "./credits.ts";

const FILES: readonly (readonly string[])[] = [
  ["mars", "moon", "venus", "jupiter", "ceres", "eris", "neptune", "haze", "clouds", "ring"],
  ["earth-day", "earth-night"],
  ["carina"],
  ["veil"],
  ["cliffs"],
  ["far-mars", "far-venus", "far-jupiter", "far-neptune", "saturn"],
];

/** CREDITS, each row with the files it credits. */
export const FILED: readonly (Credit & { readonly files: readonly string[] })[] = CREDITS.map((credit, at) => ({
  ...credit,
  files: FILES[at] ?? [],
}));
