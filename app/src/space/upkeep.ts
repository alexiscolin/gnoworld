// What the loop (frame.ts) keeps of a Space between its frames, and the page's calls tell it: whether the next frame must be drawn, how the
// frames keep up, the pixel ratio they may use, and the page's plate to lay again where that ratio changes.
import { Governor } from "./pace.ts";
import { Redraw } from "./redraw.ts";

export interface Plated {
  readonly box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly words: number;
}

export class Upkeep {
  readonly redraw = new Redraw();
  readonly governor = new Governor();
  /** The most pixels per page pixel the frames keep up with: none till they fail to. */
  ratioCap = Infinity;
  plated: Plated | undefined;
  /** Asks the loop for a frame where it sleeps; a no-op while it is awake. Set once the loop runs, and never touches back. */
  wake: () => void = () => undefined;

  /** Something the numbers do not show changed: the next frame is drawn, and a sleeping loop wakes for it. */
  touch(): void {
    this.redraw.touch();
    this.wake();
  }
}
