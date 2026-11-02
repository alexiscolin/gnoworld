// Which of the 24 a world is, and which other mixes under it (ADR-0002 §3). Every byte of the seed feeds a look (F3476), so the class reads a second hash of it. The
// strange ones stay rare. A nature leans a world without fixing it, and is never shown: the rules read 9 of 12 unseen realms right
// (.claude/tmp/slice-7/reports/chain-feasibility.md), so an error must cost nothing. Tier 1 (docs/REVIEW.md).
import type { Anchor } from "./anchors.ts";
import { sha256 } from "./sha256.ts";

/** What a nudge reads: the rest of a realm's nature (a system, a page) leans nowhere, and `/p/` packages make no world. */
const NATURES = ["token", "dao", "game"] as const;
export type Nature = (typeof NATURES)[number];

export interface RealmFunctions {
  readonly functions: readonly string[];
}

// Each anchor's share of 256 bytes, in ANCHORS' order. Tidally locked, shattered, lava world, two-faced and hot giant are the strange
// ones, 26 of 256.
const WEIGHTS: readonly (readonly [Anchor, number])[] = [
  ["rocky", 18],
  ["temperate", 16],
  ["desert", 18],
  ["ocean", 13],
  ["ice", 14],
  ["volcanic", 13],
  ["gas giant", 17],
  ["ice giant", 12],
  ["cloud deck", 11],
  ["tidally locked", 6],
  ["dark carbon", 9],
  ["shattered", 5],
  ["nitrogen ice", 11],
  ["grooved ice", 11],
  ["snowball", 9],
  ["hycean", 9],
  ["archean", 8],
  ["lava world", 5],
  ["two-faced", 5],
  ["water cloud giant", 10],
  ["azure giant", 9],
  ["dark giant", 8],
  ["hot giant", 5],
  ["sub-Neptune", 14],
];
const LEANS: Record<Nature, readonly [Anchor, ...Anchor[]]> = {
  token: ["gas giant", "ice giant"],
  dao: ["temperate"],
  game: ["volcanic", "tidally locked", "shattered"],
};
// The bytes under this, of 256, take a nature's lean: about a third, so a misread nature moves a third of its worlds at most.
const LEAN = 90;
const MINOR_WORD = 26;
const TOKEN = ["Transfer", "Approve", "BalanceOf", "TotalSupply"];
const GAME = ["Play", "Move", "Guess", "Shot", "Lobby", "Game", "Challenge"];

/**
 * 32 bytes more of a world, for what the seed's own have no room for. Byte 0 is its class, 1 and 2 its nudge, 3 to 8 its signs' form,
 * 9 to 25 its surface, 26 and 27 its minor class, 28 and 29 its palette's grade.
 */
export const moreSeed = (seed: Uint8Array): Uint8Array => sha256(seed);

// The anchor `left` falls on, walking `weights` in order: what is past all but the last is the last's.
function walked(weights: readonly (readonly [Anchor, number])[], left: number): Anchor {
  let rest = left;
  for (const [anchor, weight] of weights.slice(0, -1)) {
    if (rest < weight) return anchor;
    rest -= weight;
  }
  return weights.at(-1)?.[0] ?? "rocky";
}

/** The class of a world from its seed, a nature leaning a third of its worlds its own way. */
export function anchorOf(seed: Uint8Array, nature: Nature | null = null): Anchor {
  const [draw = 0, lean = 0, among = 0] = moreSeed(seed);
  if (nature === null || lean >= LEAN) return walked(WEIGHTS, draw);
  const leaning = LEANS[nature];
  return leaning[among % leaning.length] ?? walked(WEIGHTS, draw);
}

/** The class mixed under `dominant`: any other, by its weight among the others, on one word so a small weight keeps its share. */
export function minorOf(more: Uint8Array, dominant: Anchor): Anchor {
  const others = WEIGHTS.filter(([anchor]) => anchor !== dominant);
  const total = others.reduce((sum, [, weight]) => sum + weight, 0);
  const word = (more[MINOR_WORD] ?? 0) * 256 + (more[MINOR_WORD + 1] ?? 0);
  return walked(others, Math.floor((word * total) / 65536));
}

const holds = (functions: readonly string[], word: string) => functions.some((name) => name.includes(word));

function realmNature({ functions }: RealmFunctions): Nature | null {
  if (TOKEN.every((name) => functions.includes(name))) return "token";
  if (holds(functions, "Vote") && holds(functions, "Propos")) return "dao";
  return GAME.some((word) => holds(functions, word)) ? "game" : null;
}

/** The nature most of a world's classified realms have, a tie to the first rule. Names come capped: 512 realms of 256 at most. */
export function natureOf(realms: readonly RealmFunctions[]): Nature | null {
  const counts = new Map<Nature, number>();
  for (const realm of realms) {
    const nature = realmNature(realm);
    if (nature !== null) counts.set(nature, (counts.get(nature) ?? 0) + 1);
  }
  let found: Nature | null = null;
  let most = 0;
  for (const nature of NATURES) {
    const count = counts.get(nature) ?? 0;
    if (count > most) [found, most] = [nature, count];
  }
  return found;
}
