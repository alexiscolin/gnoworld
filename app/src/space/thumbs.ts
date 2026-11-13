// A world's planet drawn alone from its seed on a canvas of its own, off the page, for the pages the scene does not run on (the search's
// Discover): the rail's portraits (portraits.ts), lent a frame by the browser's. Its chunk is asked once a card shows, never with the palette.
import { savesData } from "../lib/saveData.ts";
import { createRenderer, releasing } from "./renderer.ts";
import type { WebGLRenderer } from "three";
import { portraitsOf, type PortraitDevice } from "./portraits.ts";

/** The largest thumb's side in page pixels (ui's `--thumb-l`): drawn at the screen's pixel ratio, up to two. */
const SIZE = 64;
/** How long the canvas stays after its last draw: a context of its own counts against the page's cap. */
const IDLE_MS = 25_000;
let device: PortraitDevice | undefined;
let owned: WebGLRenderer | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;

function deviceOf(): PortraitDevice {
  if (device !== undefined) return device;
  const renderer = createRenderer(document.createElement("canvas"), true);
  owned = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(SIZE, SIZE, false);
  device = {
    renderer,
    base: import.meta.env.BASE_URL,
    halved: savesData,
    lend: (draw) => {
      requestAnimationFrame(draw);
    },
    signal: new AbortController().signal,
  };
  return device;
}

// Idle for IDLE_MS after the last draw: the context goes, and the next ask makes a new one.
function releaseLater(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (owned !== undefined) releasing(owned, () => undefined).dispose();
    owned = undefined;
    device = undefined;
  }, IDLE_MS);
}

/** The thumbs of `ids` by their ids, as the rail's portraits are; a world whose maps did not come has none. Throws where WebGL2 is refused. */
export function thumbsOf(ids: readonly string[]): Promise<Map<string, string>> {
  clearTimeout(idle);
  return portraitsOf(deviceOf(), ids, SIZE).finally(releaseLater);
}
