// The circle a page keeps for the Earth or a world, read on the page, and what a world's page asks of the scene in it: the worlds' file, read
// once a visit, and this reader's visits, which the device keeps.
import { readWorlds } from "../../lib/chain/realms.ts";
import { readFlag, writeFlag } from "../../lib/flags.ts";
import type { Circle, EarthState } from "../../scene/earth/device.ts";
import type { WorldAsk, WorldPage } from "../../scene/world/part.ts";

const VISITED = "gnoworld:visited:";

const visitKey = (universe: string, id: string) => `${VISITED}${universe}:${id}`;

/** Whether this reader has visited world `id` of `universe`: the device keeps it, or nothing does. */
export const visitedIn = (universe: string) => (id: string) => readFlag(visitKey(universe, id)) !== null;

// The plate where the page fixes it beside the globe: in the flow it scrolls, and the canvas does not. Its fill as sRGB bytes, whatever
// colour space the browser computes it in, for the scene paints it again behind the globe.
function plateBeside(globe: HTMLElement) {
  const plate = document.querySelector<HTMLElement>("[data-look='plate']");
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (plate === null || context === null || getComputedStyle(globe).position !== "fixed") return undefined;
  const { left, top, right, bottom } = plate.getBoundingClientRect();
  context.fillStyle = getComputedStyle(plate, "::before").backgroundColor;
  context.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return { left, top, right, bottom, fill: [red, green, blue] as const };
}

// The circle the page keeps for the globe, on the page and not on the window: a page scrolled away keeps its globe.
export function circleOf(globe: HTMLElement): Circle | undefined {
  const { left, top, width } = globe.getBoundingClientRect();
  if (width <= 0) return undefined;
  const plate = plateBeside(globe);
  return {
    x: left + width / 2,
    y: top + scrollY + width / 2,
    radius: width / 2,
    ...(plate === undefined ? {} : { plate }),
  };
}

/** What a world's page asks of the scene for world `id` in `circle`. */
export function worldAsk(circle: Circle, id: string, page: WorldPage): WorldAsk {
  return {
    circle,
    id,
    universe: page.universe,
    page,
    file: () => readWorlds(import.meta.env.BASE_URL),
    visited: visitedIn(page.universe)(id),
    remember: () => {
      writeFlag(visitKey(page.universe, id), "1");
    },
  };
}

/** Marks the box a page keeps for its body with how far it came, which the page's stylesheet keeps the globe's room and opens the plate from:
 * "waiting" while the scene may yet come (`status` "off" or "loading"), so a window that loads it by itself does not jump; "none" where
 * nothing will. A lost context takes both away. */
export function markGlobe(kind: "earth" | "world", body: EarthState, status: string): void {
  const globe = document.querySelector<HTMLElement>("[data-globe]");
  if (globe === null) return;
  const coming = status === "off" || status === "loading";
  const state = status === "on" && (body === "loading" || body === "drawn") ? body : coming ? "waiting" : "none";
  globe.dataset[kind] = state;
  if (state !== "drawn") tintPage(undefined);
}

/** Tints the page with a world's own colour where the globe's sibling takes it, as the Earth's blue is; none gives the page its blue back. */
export function tintPage(colour: string | undefined): void {
  const globe = document.querySelector<HTMLElement>("[data-globe]");
  for (const element of [globe, globe?.nextElementSibling]) {
    if (!(element instanceof HTMLElement)) continue;
    if (colour === undefined) element.style.removeProperty("--world");
    else element.style.setProperty("--world", colour);
  }
}
