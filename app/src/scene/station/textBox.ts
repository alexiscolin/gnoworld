// The page's text the Earth's view keeps off (part 7x2): the hero's box, which the cosmos is given, and the list of worlds under it where the
// page holds them in one column, a phone's (its title and links, not the room it keeps below them for the ticker): the Earth's ring ran
// under it. Where the list stands apart, fixed at the top over a tall screen, the hero's alone. Measured once a box comes, never on a frame.
import type { ClearBox } from "@gnoworld/core";

const ADJACENT = 64;

export class TextBox {
  #given: ClearBox | undefined;
  #kept: ClearBox | undefined;

  /** The box to keep off for the hero's `given`, measured again only when another comes. */
  of(given: ClearBox | undefined): ClearBox | undefined {
    if (given !== this.#given) [this.#given, this.#kept] = [given, given === undefined ? undefined : withList(given)];
    return this.#kept;
  }
}

function withList(hero: ClearBox): ClearBox {
  const box = { ...hero };
  for (const element of document.querySelectorAll("nav[data-rail] > *")) {
    const part = element.getBoundingClientRect();
    if (part.width === 0 || part.height === 0 || part.top < hero.bottom - 1 || part.top - box.bottom > ADJACENT)
      continue;
    box.left = Math.min(box.left, part.left);
    box.right = Math.max(box.right, part.right);
    box.bottom = Math.max(box.bottom, part.bottom);
  }
  return box;
}
