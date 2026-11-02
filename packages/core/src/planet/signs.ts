// A world's stage and the signs that show it (ADR-0002 §10), pure: a stage reads the same on all twelve classes, and each class shows it in
// its own form. Fixed per sign: what it means, where it shows, how it grows, its colour family. Free per world, from its seed: its pattern.
// Vitality is matter, the people present are light, and a world at rest with nobody here carries no sign at all, so it stays the render
// Alexis approved. Every sign means real data (§10). Only + - * / reach a form. Tier 1 (docs/REVIEW.md).
import type { Anchor, Rgb } from "./anchors.ts";
import { moreSeed } from "./choice.ts";
import { share } from "./gauges.ts";
import { between, seedShare } from "./look.ts";

export const STAGES = ["seed", "rest", "living", "inhabited", "busy", "beacon"] as const;
export type Stage = (typeof STAGES)[number];

export const LIGHT_KINDS = ["towns", "coasts", "cracks", "seams", "belts", "pools", "dusk"] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

export interface WorldState {
  /** `nextVitality`'s share. */
  readonly vitality: number;
  /** `presenceOf`'s share. */
  readonly present: number;
  /** `isFresh`: a new family nobody has visited. */
  readonly fresh: boolean;
}

interface LightSign {
  /** How much of its surface is settled, 0 to 1: none draws no light. It grows with the vitality, and a little with the people here. */
  readonly extent: number;
  /** How lit it is, by the people here: a vitality never brightens a world. */
  readonly level: number;
  readonly kind: LightKind;
  /** How wide its settled regions are. */
  readonly grain: number;
  /** How fine its form is: a town's or a crack's spill, a seam's scale, a belt's count, a pool's blur, a twilight's width. */
  readonly fine: number;
  readonly offset: Rgb;
  /** Where the lights' map turns under the world; 0 on a world with a sea, whose lights sit on its land. */
  readonly turn: number;
}

export interface WorldSigns {
  readonly stage: Stage;
  /** A factor on a world's radius: 1 at rest. Popularity shows as matter, never as brightness. */
  readonly size: number;
  /** A seed's glow, 0 on any other stage. */
  readonly signal: number;
  readonly lights: LightSign;
}

type Span = readonly [number, number];

const SEED_DAYS = 7;
const LIVING = 0.3;
const CLIMB: readonly (readonly [Stage, number])[] = [
  ["beacon", 0.88],
  ["busy", 0.7],
  ["inhabited", 0.5],
  ["living", LIVING],
];
const GROWTH = 0.6;
const AWAKE = 0.12;
const LEVEL: Span = [0.35, 1];
const SEED_SIZE: Span = [0.5, 0.8];
const SEED_SIGNAL: Span = [0.45, 1];
const OFFSET = 16;
const TURN = Math.PI * 2;

const FORMS: Record<Anchor, { readonly kind: LightKind; readonly grain: Span; readonly fine: Span }> = {
  rocky: { kind: "towns", grain: [1.2, 2.2], fine: [0.7, 1.1] },
  temperate: { kind: "coasts", grain: [1.2, 2], fine: [0.85, 1] },
  desert: { kind: "towns", grain: [0.9, 1.6], fine: [0.45, 0.8] },
  ocean: { kind: "coasts", grain: [1.4, 2.4], fine: [1, 1.2] },
  ice: { kind: "cracks", grain: [1.2, 2], fine: [0.8, 1.2] },
  volcanic: { kind: "seams", grain: [1.4, 2.4], fine: [4, 5.6] },
  "gas giant": { kind: "belts", grain: [1, 1.8], fine: [24, 40] },
  "ice giant": { kind: "belts", grain: [1, 1.6], fine: [34, 52] },
  "cloud deck": { kind: "pools", grain: [1.4, 2.4], fine: [4, 5] },
  "tidally locked": { kind: "dusk", grain: [1.6, 2.6], fine: [0.2, 0.34] },
  "dark carbon": { kind: "seams", grain: [1, 1.8], fine: [5.5, 7.5] },
  shattered: { kind: "cracks", grain: [1.2, 2], fine: [0.3, 0.5] },
};

/** A new family stays a seed until its first visit or 7 days; a world of unknown age is no new one. */
export const isFresh = (ageDays: number | null, visited: boolean): boolean =>
  !visited && ageDays !== null && ageDays >= 0 && ageDays < SEED_DAYS;

export function stageOf({ vitality, fresh }: WorldState): Stage {
  if (fresh) return "seed";
  const reached = share(vitality);
  return CLIMB.find(([, from]) => reached >= from)?.[0] ?? "rest";
}

// A world's own pattern, from the second hash's bytes past its class: it never changes while the world grows.
function formOf(seed: Uint8Array, anchor: Anchor): Omit<LightSign, "extent" | "level"> {
  const more = moreSeed(seed);
  const { kind, grain, fine } = FORMS[anchor];
  return {
    kind,
    grain: between(grain, seedShare(more, 3)),
    fine: between(fine, seedShare(more, 4)),
    offset: [seedShare(more, 5) * OFFSET, seedShare(more, 6) * OFFSET, seedShare(more, 7) * OFFSET],
    turn: kind === "coasts" ? 0 : seedShare(more, 8) * TURN,
  };
}

/** What `state` shows on the world of `seed` and `anchor`. */
export function worldSigns(seed: Uint8Array, anchor: Anchor, state: WorldState): WorldSigns {
  const [grown, here] = [share(state.vitality), share(state.present)];
  const climbed = share((grown - LIVING) / (1 - LIVING));
  const popular = Math.max(grown, here);
  return {
    stage: stageOf(state),
    size: state.fresh ? between(SEED_SIZE, popular) : 1 + GROWTH * climbed,
    signal: state.fresh ? between(SEED_SIGNAL, popular) : 0,
    lights: {
      ...formOf(seed, anchor),
      extent: Math.max(((climbed + 1) * climbed) / 2, AWAKE * here),
      level: between(LEVEL, here),
    },
  };
}
