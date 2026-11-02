// The twelve anchors more (Alexis, 2026-11-02), each a real body or a documented kind of planet (the part's state file names each
// reference): realistic, the strange ones rare. Until 7b5 draws the recipe, today's shader draws each on the row of the kept anchor
// nearest it, in its own colours, set by eye from its reference's published colour. Tier 1 (docs/REVIEW.md).
import type { AnchorRow, KeptAnchor, MoreAnchor } from "./anchors.ts";
import { LAVA, ramp, rgb, SKY } from "./colours.ts";

export const moreRows = (kept: Record<KeptAnchor, AnchorRow>): Record<MoreAnchor, AnchorRow> => ({
  // Pluto and Triton: cream nitrogen plains, red-brown tholins.
  "nitrogen ice": { ...kept.ice, palettes: [ramp(0x2b1a14, 0x9a6a50, 0xeadfcf), ramp(0x3a2622, 0xb58e7e, 0xf2e6dc)] },
  // Ganymede: dark old terrain cut by bright grooved lanes.
  "grooved ice": {
    ...kept.ice,
    maps: ["moon"],
    second: "eris",
    palettes: [ramp(0x3a3530, 0x8a8478, 0xdcdad4), ramp(0x34363a, 0x8e9196, 0xe4e6ea)],
  },
  // The Cryogenian Earth: ice to the tropics under a thin air.
  snowball: {
    ...kept.ice,
    palettes: [ramp(0x4a6080, 0xaec4dc, 0xf2f6fb), ramp(0x46607a, 0xa4bcd6, 0xeef4fa)],
    clouds: [0.05, 0.2],
    rim: { colours: SKY, thickness: [0.015, 0.025] },
  },
  // K2-18 b: one ocean under a hydrogen sky.
  hycean: {
    ...kept.ocean,
    palettes: [ramp(0x061a33, 0x123a66, 0x5f8db8), ramp(0x08202c, 0x1b4a5c, 0x6a9cab)],
    sea: { shallow: rgb(0x14466e), deep: rgb(0x061c3c) },
  },
  // The Archean Earth, the pale orange dot: bare land, seas, an organic haze.
  archean: {
    ...kept.temperate,
    palettes: [ramp(0x2a1a10, 0x6a4a2a, 0xb08a5a), ramp(0x30200f, 0x7a5530, 0xc49a62)],
    rim: { colours: [rgb(0x7a5226), rgb(0x80592c)], thickness: [0.04, 0.05] },
  },
  // 55 Cancri e: magma seas under a dark crust.
  "lava world": {
    ...kept.volcanic,
    palettes: [ramp(0x070302, 0x2a1208, 0x6a2a12), ramp(0x0a0403, 0x341608, 0x7a3416)],
    glow: { colour: LAVA, level: [0.6, 0.72] },
  },
  // Iapetus: one face coal-dark, the other bright ice.
  "two-faced": { ...kept.rocky, palettes: [ramp(0x0d0a08, 0x5a4a3c, 0xe8e2d8), ramp(0x120c08, 0x6a5240, 0xefe8dc)] },
  // Sudarsky's class II: white water clouds.
  "water cloud giant": {
    ...kept["gas giant"],
    palettes: [ramp(0x8a8478, 0xd0ccc2, 0xf6f4ee), ramp(0x7c8088, 0xc4c8cc, 0xf2f4f6)],
  },
  // HD 189733 b's deep blue, Sudarsky's class III.
  "azure giant": {
    ...kept["ice giant"],
    palettes: [ramp(0x0a1640, 0x1f3f8c, 0x6f8fd0), ramp(0x0c1a4a, 0x2a4a9a, 0x7a9cd8)],
  },
  // TrES-2 b, under 1% of its light sent back: Sudarsky's class IV.
  "dark giant": {
    ...kept["gas giant"],
    palettes: [ramp(0x060505, 0x161210, 0x3a2c24), ramp(0x080606, 0x1c1410, 0x46302a)],
  },
  // KELT-9 b, an ultra-hot Jupiter: silicate clouds; no glow today, for a glow on a banded world hides its night's lights.
  "hot giant": {
    ...kept["gas giant"],
    palettes: [ramp(0x1a0a06, 0x5a2a16, 0xb8724a), ramp(0x200c08, 0x6a3018, 0xc88050)],
  },
  // GJ 1214 b: a hazy, featureless sky, the commonest size of planet known.
  "sub-Neptune": {
    ...kept["ice giant"],
    palettes: [ramp(0x3a4450, 0x8a96a2, 0xd6dce2), ramp(0x40483e, 0x949c8a, 0xdadcce)],
  },
});
