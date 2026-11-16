// The close planet of a world's or a realm's page, framed larger than the window (globe.module.css, `.globe[data-framing]`): this is
// that rule as numbers, so a test can hold it at each window; the stylesheet is what draws it.

// The plate's words end this far short of its width (the video's 578 px at its 808).
const WORDS_SHORT = 230;
// The study's centre, as shares of the window, and its radius, as shares of the width and of the height.
const ACROSS = 0.76;
const DOWN = 0.68;
const OF_WIDTH = 0.37;
const OF_HEIGHT = 0.59;
// The glow reaches 1.18 radii, and keeps a step (--space-s) off the words.
const GLOW = 1.18;
const STEP = 16;

/** Where the plate's words end, from the plate's width. */
export const wordsEnd = (plate: number) => plate - WORDS_SHORT;

/** The planet's centre and radius in the window: its glow stays right of the plate's words. */
export function framedPlanet(of: { wordsEnd: number; width: number; height: number }) {
  const x = ACROSS * of.width;
  const room = (x - of.wordsEnd - STEP) / GLOW;
  return {
    x,
    middle: DOWN * of.height,
    radius: Math.max(0, Math.min(OF_WIDTH * of.width, OF_HEIGHT * of.height, room)),
  };
}
