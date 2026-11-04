// Who made each texture (docs/design/textures.md holds how each was changed). A texture shows only with its credit: CC BY 4.0 §3(a)(2)
// allows a link, and ESA/Hubble's and ESA/Webb's terms ask the full credit, with changes noted after it. The files each row credits are in
// creditFiles.ts, which the first screen never ships.

export interface Credit {
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
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://www.solarsystemscope.com/textures/",
    read: "2026-11-02",
    line: "Maps: Solar System Scope, CC BY 4.0, warped and recoloured",
  },
  {
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://www.solarsystemscope.com/textures/",
    read: "2026-11-02",
    line: "Earth: Solar System Scope, CC BY 4.0, based on NASA imagery; scaled to 4096 by 2048; the day map warped and recoloured on temperate and ocean worlds, the night map warped on generated worlds",
  },
  {
    author: "ESA/Hubble",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://esahubble.org/images/heic0707a/",
    read: "2026-11-02",
    line: "Nebula: NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA), ESA/Hubble, CC BY 4.0; cropped, stars removed, recoloured and warped",
  },
  {
    author: "ESA/Hubble",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://esahubble.org/images/heic1520a/",
    read: "2026-11-02",
    line: "Nebula: NASA, ESA, Hubble Heritage Team, ESA/Hubble, CC BY 4.0; cropped, stars removed, recoloured and warped",
  },
  {
    author: "ESA/Webb",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://esawebb.org/images/weic2205a/",
    read: "2026-11-02",
    line: "Nebula: NASA, ESA, CSA, and STScI, ESA/Webb, CC BY 4.0; cropped, stars removed, recoloured and warped",
  },
];
