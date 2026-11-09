// What the home's HTML asks for before its scripts run, on a computer: the cosmos Earth's first-frame maps, the small variants, as it
// asks for worlds.json (routes/home.tsx, D334). Written at build time (entry.server.tsx), so the first screen's script weighs nothing
// more; a phone's media query leaves them unfetched, as the 3D waits there. The scene's chunk is not preloaded: measured at 10 Mbit/s,
// it delayed the loader's leave from about 2 s to 4 to 7 s.
import { PHONE_QUERY } from "@gnoworld/core";
import { mapUrl } from "./space/planet/mapUrl.ts";

// The widths the cosmos loads them at: a body's 2048, the Moon's 1024 (scene/earth/maps.ts, scene/cosmos/maps.ts).
const MAPS: readonly (readonly [string, number])[] = [
  ["earth-day", 2048],
  ["earth-night", 2048],
  ["clouds", 2048],
  ["moon", 1024],
];
const WORLDS = /<link rel="preload" href="[^"]*worlds\.json"[^>]*\/>/;

/** The tags to preload the first-frame maps. */
export const preloadTags = (): string =>
  MAPS.map(
    ([name, width]) =>
      `<link rel="preload" href="${mapUrl(name, "/", width)}" as="fetch" crossorigin="anonymous" media="not ${PHONE_QUERY}"/>`,
  ).join("");

/** A page with the tags beside its worlds.json preload, which the pages that have the cosmos carry; any other page as it was. */
export function withPreloads(html: string): string {
  const worlds = WORLDS.exec(html)?.[0];
  return worlds === undefined ? html : html.replace(worlds, worlds + preloadTags());
}
