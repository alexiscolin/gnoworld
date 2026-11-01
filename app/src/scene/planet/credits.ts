// Who made each texture (docs/design/textures.md holds how each was changed). A texture shows only with its credit: CC BY 4.0 §3(a)(2)
// allows a link, and ESA/Hubble's terms ask the full credit, with changes noted after it.

export interface Credit {
  /** The files under public/textures, with no extension. */
  readonly files: readonly string[];
  readonly author: string;
  readonly licence: string;
  readonly source: string;
  /** The words shown. */
  readonly line: string;
}

export const CREDITS: readonly Credit[] = [
  {
    files: ["mars", "moon", "venus", "jupiter", "ceres", "eris", "neptune", "haze", "clouds", "ring"],
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    source: "https://www.solarsystemscope.com/textures/",
    line: "Maps: Solar System Scope, CC BY 4.0, warped and recoloured",
  },
  {
    files: ["carina"],
    author: "ESA/Hubble",
    licence: "CC BY 4.0",
    source: "https://esahubble.org/images/heic0707a/",
    line: "Nebula: NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA), ESA/Hubble, CC BY 4.0; cropped, stars removed, recoloured and warped",
  },
];
