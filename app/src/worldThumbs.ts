// A world's real planet as a small picture, wherever a thumb shows it: asked lazily as the thumb scrolls into view, a few at a time, from
// space/thumbs.ts's late chunk; the thumb wears its drawn disc till the picture comes, and for good where the page saves data or draws no WebGL.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { restsFor } from "./later.ts";
import { savesData } from "./lib/saveData.ts";
import { pictureOf } from "./lib/worldPictures.ts";

/** Worlds drawn in one go: a shelf of sixty never holds the main thread for one long frame. */
const BATCH = 6;
const WAIT_MS = 80;

const pictures = createStore<ReadonlyMap<string, string>>(() => new Map());
const asked = new Set<string>();
const retried = new Set<string>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let drawing = false;
let refused = false;

async function drawQueue(): Promise<void> {
  let chunk: typeof import("./space/thumbs.ts");
  try {
    chunk = await import("./space/thumbs.ts");
  } catch {
    // The chunk did not come (a flaky network): its worlds may be asked again, and the discs stay till then.
    for (const id of queue.splice(0)) asked.delete(id);
    return;
  }
  const { thumbsOf } = chunk;
  while (queue.length > 0) {
    // Each batch once the browser rests: never in the middle of a flight's frames or a fade (D428).
    await restsFor();
    const batch = queue.splice(0, BATCH);
    const drawn = await thumbsOf(batch);
    // A world left without a picture (a lost context, a map that did not come) may be asked again, once.
    for (const id of batch) {
      if (drawn.has(id) || retried.has(id)) continue;
      retried.add(id);
      asked.delete(id);
    }
    pictures.setState((before) => new Map([...before, ...drawn]), true);
  }
}

function want(world: string): void {
  refused ||= savesData();
  if (refused || asked.has(world)) return;
  asked.add(world);
  queue.push(world);
  timer ??= setTimeout(() => {
    timer = undefined;
    if (drawing) return;
    drawing = true;
    drawQueue()
      .catch(() => {
        // No WebGL2: every thumb keeps its disc, and nothing more is asked.
        refused = true;
        queue = [];
      })
      .finally(() => {
        drawing = false;
      });
  }, WAIT_MS);
}

// The world's drawn planet once it came, else undefined; `ref` goes on the element whose showing asks for it.
function useWorldThumb(world: string | undefined) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const target = ref.current?.firstElementChild ?? ref.current;
    if (world === undefined || target == null || typeof IntersectionObserver === "undefined") return undefined;
    if (pictureOf(world) !== undefined) return undefined;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
      want(world);
      seen.disconnect();
    });
    seen.observe(target);
    return () => {
      seen.disconnect();
    };
  }, [world]);
  const src = useSyncExternalStore(pictures.subscribe, () =>
    world === undefined ? undefined : pictures.getState().get(world),
  );
  return { ref, src };
}

/** The world's picture: the one the scene took, else its planet once drawn, else undefined; `ref` goes on the element whose showing asks for it. */
export function useWorldPicture(world: string | undefined) {
  const { ref, src } = useWorldThumb(world);
  return { ref, src: (world === undefined ? undefined : pictureOf(world)) ?? src };
}
