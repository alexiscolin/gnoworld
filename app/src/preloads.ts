// What the home's HTML asks for before its scripts run, on a computer: the cosmos Earth's first-frame maps, the small variants, and
// worlds.json (D334). They are in the HTML alone, never in a route's `links`: React Router adds those on a client navigation too, and a
// visit that came from the Earth's page, whose scene already read the file, would ask it a second time. Written at build time (entry.server.tsx), so the first screen's script weighs nothing
// more; a phone's media query leaves them unfetched, as the 3D waits there. The scene's chunk is not preloaded: measured at 10 Mbit/s,
// it delayed the loader's leave from about 2 s to 4 to 7 s.
import { hubWorldOf, PHONE_QUERY } from "@gnoworld/core";
import { mapNamesOf, worldOf } from "./space/planet/generated.ts";
import { mapUrl } from "./space/planet/mapUrl.ts";

// The widths the cosmos loads them at: a body's 2048, the Moon's 1024 (scene/earth/maps.ts, scene/cosmos/maps.ts).
const MAPS: readonly (readonly [string, number])[] = [
  ["earth-day", 2048],
  ["earth-night", 2048],
  ["clouds", 2048],
  ["moon", 1024],
];

const tag = (href: string): string =>
  `<link rel="preload" href="${href}" as="fetch" crossorigin="anonymous" media="not ${PHONE_QUERY}"/>`;
const tags = (maps: readonly (readonly [string, number])[]): string =>
  maps.map(([name, width]) => tag(mapUrl(name, "/", width))).join("");

/** The tags to preload the first-frame maps. */
export const preloadTags = (): string => tags(MAPS);

// A world's page preloads the maps its planet reads at 2048 (space/parts/maps.ts); the Earth's and the home's, the same first-frame maps (the
// planet is built from them, 0.93 MB, the full size comes later). Only the data: the scene's chunks stay off.
const worldFile = tag("/worlds.json");

// The pages that hold the cosmos (routes.ts): the home, a universe's, the whole cosmos and a system.
const COSMOS_PAGES: ReadonlySet<string> = new Set(["routes/home", "universe", "cosmos-universe", "cosmos-system"]);

const hasHub = (data: unknown): data is { slug: string; realms?: string[] } =>
  typeof data === "object" &&
  data !== null &&
  "slug" in data &&
  typeof data.slug === "string" &&
  (!("realms" in data) ||
    data.realms === undefined ||
    (Array.isArray(data.realms) && data.realms.every((r) => typeof r === "string")));

/** What a cosmos page's, an Earth's or a world's page preloads, by its route (routes.ts) and its loader's data: the worlds file and its maps; no other page. */
export function pagePreloads(routeId: string, data: unknown): string {
  if (COSMOS_PAGES.has(routeId)) return worldFile + preloadTags();
  if (routeId === "routes/earth" || routeId === "universe-earth") return worldFile + preloadTags();
  if ((routeId === "routes/world" || routeId === "universe-world") && hasHub(data))
    return worldFile + tags(mapNamesOf(worldOf(hubWorldOf(data))).map((name) => [name, 2048] as const));
  return "";
}

/** A page with its own preloads (pagePreloads) at the head's end, and a page with none as it was. */
export const withPreloads = (html: string, own = ""): string =>
  own === "" ? html : html.replace("</head>", `${own}</head>`);
