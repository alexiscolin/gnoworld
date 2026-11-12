// The disc a world wears as a thumb: the one the scene gives it, as a picture for ui's PlanetThumb (Discover's cards, the passport's route).
import { clamp01, worldLook } from "@gnoworld/core";

const hex = (channel: number | undefined) =>
  Math.round(clamp01(channel ?? 0) * 255)
    .toString(16)
    .padStart(2, "0");
const colour = (rgb: readonly number[]) => `#${hex(rgb[0])}${hex(rgb[1])}${hex(rgb[2])}`;

/** The world's look's ramp, lit from the upper left as the scene lights it (`worldLook`, the cosmos's own), as an image's address. */
export function discOf(world: string): string {
  const { ramp } = worldLook(world);
  const stop = (offset: string, rgb: readonly number[]) => `<stop offset='${offset}' stop-color='${colour(rgb)}'/>`;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><radialGradient id='g' cx='35%' cy='30%'>" +
    `${stop("0", ramp[2])}${stop("0.58", ramp[1])}${stop("1", ramp[0])}</radialGradient></defs>` +
    "<rect width='64' height='64' fill='url(#g)'/></svg>";
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
