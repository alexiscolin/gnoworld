// The scene's door. Only a page that shows space calls it, the cosmos, the Earth and a world's, so a page that never does asks for none of its code, and
// the first screen of the others holds none of it (ADR-0001 §12's budget). The universe comes after the text and stays once it came:
// leaving covers it, for the way back. A chunk that does not come leaves the page as it is, and the next page that shows space asks again.
import { useEffect, useState } from "react";
import type { EarthPage, Shown, WorldPage, WorldShown } from "./host.ts";

const loadUniverse = () => import("./mountUniverse.tsx");

let wanted: Shown = false;
let asked = false;
type Page = EarthPage | WorldPage;

let page: Page | undefined;
let draw: ((shown: Shown, page?: Page) => void) | undefined;
let doorAnswered: Promise<void> = Promise.resolve();

const drawn = (to: (shown: Shown, page?: Page) => void) => {
  if (page === undefined) to(wanted);
  else to(wanted, page);
};

function show(shown: Shown, from?: Page): void {
  wanted = shown;
  page = from;
  if (draw !== undefined) drawn(draw);
  else if (shown && !asked) {
    asked = true;
    doorAnswered = loadUniverse()
      .then(({ mountUniverse }) => {
        draw = mountUniverse();
        drawn(draw);
      })
      .catch(() => {
        asked = false;
      });
  }
}

const pageLoaded = (signal: AbortSignal) =>
  new Promise<void>((done) => {
    if (document.readyState === "complete") done();
    else
      window.addEventListener(
        "load",
        () => {
          done();
        },
        { once: true, signal },
      );
  });

/** Shows space while the calling page is on screen, with the Earth, the worlds or one world in it if the page asks, and what its signs need of
 * the page. A world is named by its id: the same id is the same world. True once the first screen is done: the page has loaded and the door
 * has answered, whichever way. */
export function useSpace(body?: "earth" | "cosmos" | WorldShown, from?: Page): boolean {
  const [firstScreenDone, setFirstScreenDone] = useState(false);
  const world = typeof body === "object" ? body.world : undefined;
  const named = typeof body === "object" ? undefined : body;
  useEffect(() => {
    show(world === undefined ? (named ?? true) : { world }, from);
    return () => {
      show(false);
    };
  }, [world, named, from]);
  useEffect(() => {
    const stop = new AbortController();
    const done = () => {
      if (!stop.signal.aborted) setFirstScreenDone(true);
    };
    Promise.all([doorAnswered, pageLoaded(stop.signal)]).then(done, done);
    return () => {
      stop.abort();
    };
  }, []);
  return firstScreenDone;
}
