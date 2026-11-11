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
// The terms of each of the two height maps, as read: SVS 4720's own, and NCEI's ETOPO 2022 record (NOAA data, waived worldwide to CC0 1.0).
const SVS_TERMS = "https://svs.gsfc.nasa.gov/help";
const ETOPO_RECORD = "https://doi.org/10.25921/Fd45-Gt74";

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
  {
    author: "Solar System Scope",
    licence: "CC BY 4.0",
    licenceUrl: CC_BY,
    source: "https://www.solarsystemscope.com/textures/",
    read: "2026-11-04",
    line: "Planets: Solar System Scope, CC BY 4.0; scaled to 1024 by 512, drawn as they came",
  },
  {
    author: "NASA",
    licence: "Public domain",
    licenceUrl: SVS_TERMS,
    source: "https://svs.gsfc.nasa.gov/4720/",
    read: "2026-11-11",
    line: "Moon relief: NASA/GSFC Scientific Visualization Studio, LRO LOLA team, Public domain; scaled to 1024 by 512 and 8 bits",
  },
  {
    author: "NOAA NCEI",
    licence: "CC0 1.0",
    licenceUrl: ETOPO_RECORD,
    source: "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
    read: "2026-11-11",
    line: "Earth relief: NOAA NCEI, ETOPO 2022, doi:10.25921/fd45-gt74, CC0 1.0; scaled to 4096 by 2048, coded in 8 bits with its seas apart",
  },
];
