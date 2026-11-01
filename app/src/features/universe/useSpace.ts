// The scene's door. Only a page that shows space calls it, the cosmos today, so a page that never does asks for none of its code, and
// the first screen of the others holds none of it (ADR-0001 §12's budget). The universe comes after the text and stays once it came:
// leaving covers it, for the way back. A chunk that does not come leaves the page as it is, and the next page that shows space asks again.
import { useEffect } from "react";

const loadUniverse = () => import("./mountUniverse.tsx");

let wanted = false;
let asked = false;
let draw: ((shown: boolean) => void) | undefined;

function show(shown: boolean): void {
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

/** Shows space while the calling page is on screen. */
export function useSpace(): void {
  useEffect(() => {
    show(true);
    return () => {
      show(false);
    };
  }, []);
}
