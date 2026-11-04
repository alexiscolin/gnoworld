// What a recipe's surface makes the program draw, one rule for the program and for the maps the cosmos asks (F4586): a small module, so
// the cosmos's chunk carries it without the recipe.
import type { Surface } from "./surface.ts";

/** A world of continents has a sea of less than this (an ocean world's starts there): the program draws its land and its climate. */
export const CONTINENTS_SEA = 0.8;
/** Whether a world's surface makes it a world of continents, its minor its bare ground. */
export const ofContinents = ({ sea }: Pick<Surface, "sea">): boolean => sea > 0 && sea < CONTINENTS_SEA;
const MINOR_SEEN = 0.002;

/** Whether the program reads a world's minor map: a minor that shows, on a ground (no bands), never on a world of continents. */
export const readsMinorMap = ({
  minorShare,
  surface,
}: {
  readonly minorShare: number;
  readonly surface: Pick<Surface, "sea" | "bands">;
}): boolean => minorShare > MINOR_SEEN && surface.bands <= 0 && !ofContinents(surface);
