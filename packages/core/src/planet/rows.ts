// The twelve anchors of ADR-0002 §3, each a data row: the seed moves inside a row's spans. Palettes are read off real worlds (the Moon's
// greys, Mercury's browns, Mars's rusts, Titan's haze, Io's sulphur, Neptune's and Uranus's blues), in sRGB. "Shattered" has fissures
// and no debris in orbit: §10 keeps debris to a far belt, for dust is a sign. The twelve more are more.ts's.
import type { Anchor, AnchorRow, KeptAnchor } from "./anchors.ts";
import { LAVA, ramp, rgb, SKY } from "./colours.ts";
import { moreRows } from "./more.ts";

const KEPT: Record<KeptAnchor, AnchorRow> = {
  rocky: {
    maps: ["moon", "ceres"],
    palettes: [ramp(0x1a1817, 0x736e66, 0xd1ccc4), ramp(0x1f1a16, 0x7a6654, 0xccb89e)],
    warp: [0.02, 0.1],
    recolour: [0.5, 0.9],
    relief: [0.018, 0.03],
    rings: 0.05,
  },
  temperate: {
    maps: ["venus", "mars"],
    palettes: [ramp(0x16240f, 0x4d6426, 0xb09a62), ramp(0x2a1f10, 0x6f6a2c, 0xc4ad78)],
    warp: [0.08, 0.2],
    recolour: [0.75, 1],
    relief: [0.0042, 0.008],
    sea: { shallow: rgb(0x1f4a80), deep: rgb(0x0b2250) },
    rim: { colours: SKY, thickness: [0.04, 0.05] },
  },
  desert: {
    maps: ["mars", "ceres"],
    palettes: [ramp(0x38170d, 0x9e5229, 0xe6ad73), ramp(0x40260f, 0xb88038, 0xedc785)],
    warp: [0.06, 0.2],
    recolour: [0.35, 0.8],
    relief: [0.014, 0.024],
    rings: 0.04,
    rim: {
      colours: [rgb(0x6e4f35), rgb(0x66402e)],
      thickness: [0.018, 0.03],
    },
  },
  ocean: {
    maps: ["venus"],
    palettes: [ramp(0x1a2612, 0x56662e, 0xb8a874), ramp(0x2c2010, 0x6e5f30, 0xc2ad80)],
    warp: [0.1, 0.24],
    recolour: [0.8, 1],
    relief: [0.008, 0.014],
    sea: { shallow: rgb(0x1b5c8f), deep: rgb(0x0a2a5c) },
    rim: { colours: SKY, thickness: [0.04, 0.05] },
  },
  ice: {
    maps: ["eris"],
    palettes: [ramp(0x403838, 0xa8b2c2, 0xf2f5fa), ramp(0x4c2e1f, 0xb2b2b8, 0xf5f0e6)],
    warp: [0.04, 0.14],
    recolour: [0.7, 1],
    relief: [0.012, 0.022],
    rings: 0.04,
  },
  volcanic: {
    maps: ["moon", "ceres"],
    palettes: [ramp(0x050404, 0x120d0a, 0x332114), ramp(0x0d0905, 0x291c0d, 0x5c421a)],
    warp: [0.04, 0.14],
    recolour: [0.92, 1],
    relief: [0.012, 0.02],
    glow: { colour: LAVA, level: [0.5, 0.58] },
    rim: {
      colours: [rgb(0x734d26), rgb(0x6e562b)],
      thickness: [0.016, 0.026],
    },
  },
  "gas giant": {
    maps: ["jupiter"],
    palettes: [ramp(0x593824, 0xb88c61, 0xf5e8d1), ramp(0x6b5738, 0xc7ad80, 0xf2e6bd)],
    warp: [0.02, 0.08],
    recolour: [0.15, 0.75],
    relief: [0, 0],
    rings: 0.5,
    banded: true,
    rim: {
      colours: [rgb(0x6b5c47), rgb(0x615e54)],
      thickness: [0.022, 0.03],
    },
  },
  "ice giant": {
    maps: ["neptune"],
    palettes: [ramp(0x0a1a59, 0x244cb2, 0x9ec7f2), ramp(0x336b7a, 0x7ac2cc, 0xccf0f2)],
    warp: [0.02, 0.08],
    recolour: [0.3, 0.9],
    relief: [0, 0],
    rings: 0.45,
    banded: true,
    rim: {
      colours: [rgb(0x36547a), rgb(0x477173)],
      thickness: [0.03, 0.04],
    },
  },
  "cloud deck": {
    maps: ["haze"],
    palettes: [ramp(0x73542e, 0xd1ad70, 0xf7e6b8), ramp(0x61380f, 0xc78538, 0xf2c26b)],
    warp: [0.06, 0.16],
    recolour: [0.3, 0.8],
    relief: [0, 0],
    banded: true,
    rim: {
      colours: [rgb(0x796643), rgb(0x765430)],
      thickness: [0.04, 0.05],
    },
  },
  "tidally locked": {
    maps: ["mars", "ceres"],
    locked: true,
    palettes: [ramp(0x29170f, 0x8c522e, 0xebb880), ramp(0x241a1a, 0x7a5c52, 0xdbbda8)],
    warp: [0.06, 0.18],
    recolour: [0.55, 0.9],
    relief: [0.014, 0.024],
    rim: {
      colours: [rgb(0x5c4d4f), rgb(0x4d4f64)],
      thickness: [0.02, 0.032],
    },
  },
  "dark carbon": {
    maps: ["ceres"],
    palettes: [ramp(0x040405, 0x0f0e0e, 0x383330), ramp(0x050403, 0x140f0b, 0x423629)],
    warp: [0.04, 0.14],
    recolour: [0.85, 1],
    relief: [0.022, 0.034],
    rings: 0.03,
  },
  shattered: {
    maps: ["moon"],
    palettes: [ramp(0x0a0908, 0x4c4540, 0xb8ad9e), ramp(0x0d0a09, 0x574233, 0xbd9e80)],
    warp: [0.08, 0.2],
    recolour: [0.7, 1],
    relief: [0.02, 0.032],
    glow: { colour: LAVA, level: [0.3, 0.6] },
  },
};

export const ROWS: Record<Anchor, AnchorRow> = { ...KEPT, ...moreRows(KEPT) };
