// Who made each texture (docs/design/textures.md holds how each was changed). A texture shows only with its credit: CC BY 4.0 §3(a)(2)
// allows a link, and ESA/Hubble's terms ask the full credit, with changes noted after it.

export interface Credit {
  /** The files under public/textures, with no extension. */
  readonly files: readonly string[];
  readonly author: string;
  readonly licence: string;
  /** The licence itself: §3(a)(1)(c) asks its URI, and the words alone do not give it. */
  readonly licenceUrl: string;
  readonly source: string;
  /** The day its terms and its files were read. */
  readonly read: string;
  /** The words shown. */
  readonly line: string;
}

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

export const CREDITS: readonly Credit[] = [
  {
    files: ["mars", "moon", "venus", "jupiter", "ceres", "eris", "neptune", "haze", "clouds", "ring"],
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://www.solarsystemscope.com/textures/",
    read: "2026-11-02",
    line: "Maps: Solar System Scope, CC BY 4.0, warped and recoloured",
  },
  {
    files: ["earth-day", "earth-night"],
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://www.solarsystemscope.com/textures/",
    read: "2026-11-02",
    line: "Earth: Solar System Scope, CC BY 4.0, based on NASA imagery; scaled to 4096 by 2048; the day map warped and recoloured on temperate and ocean worlds, the night map warped on generated worlds",
  },
  {
    files: ["carina"],
    author: "ESA/Hubble",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://esahubble.org/images/heic0707a/",
    read: "2026-11-02",
    line: "Nebula: NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA), ESA/Hubble, CC BY 4.0; cropped, stars removed, recoloured and warped",
  },
];
