// The scene's door. Only a page that shows space calls it, the cosmos today, so a page that never does asks for none of its code, and
// the first screen of the others holds none of it (ADR-0001 §12's budget). The universe comes after the text and stays once it came:
// leaving covers it, for the way back. A chunk that does not come leaves the page as it is, and the next page that shows space asks again.
import { useEffect } from "react";
import type { Shown } from "./host.ts";

const loadUniverse = () => import("./mountUniverse.tsx");

let wanted: Shown = false;
let asked = false;
let draw: ((shown: Shown) => void) | undefined;

function show(shown: Shown): void {
  wanted = shown;
  if (draw !== undefined) draw(shown);
  else if (shown && !asked) {
    asked = true;
    loadUniverse()
      .then(({ mountUniverse }) => {
        draw = mountUniverse();
        draw(wanted);
      })
      .catch(() => {
        asked = false;
      });
  }
}

/** Shows space while the calling page is on screen, with the Earth in it if the page asks. */
export function useSpace(body?: "earth"): void {
  useEffect(() => {
    show(body ?? true);
    return () => {
      show(false);
    };
  }, [body]);
}
