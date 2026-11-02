// Which of the twelve a world is (ADR-0002 §3). Every byte of the seed feeds a look (F3476), so the class reads a second hash of it. The
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

// Each anchor's share of 256 bytes, in ADR-0002's order: tidally locked and shattered are the strange ones, about one world in ten.
const WEIGHTS: readonly (readonly [Anchor, number])[] = [
  ["rocky", 30],
  ["temperate", 26],
  ["desert", 30],
  ["ocean", 20],
  ["ice", 26],
  ["volcanic", 20],
  ["gas giant", 26],
  ["ice giant", 18],
  ["cloud deck", 18],
  ["tidally locked", 12],
  ["dark carbon", 18],
  ["shattered", 12],
];
const LEANS: Record<Nature, readonly [Anchor, ...Anchor[]]> = {
  token: ["gas giant", "ice giant"],
  dao: ["temperate"],
  game: ["volcanic", "tidally locked", "shattered"],
};
// The bytes under this, of 256, take a nature's lean: about a third, so a misread nature moves a third of its worlds at most.
const LEAN = 90;
const TOKEN = ["Transfer", "Approve", "BalanceOf", "TotalSupply"];
const GAME = ["Play", "Move", "Guess", "Shot", "Lobby", "Game", "Challenge"];

/** 32 bytes more of a world, for what the seed's own have no room for. Byte 0 is its class, 1 and 2 its nudge, 3 to 8 its signs' form. */
export const moreSeed = (seed: Uint8Array): Uint8Array => sha256(seed);

function drawn(byte: number): Anchor {
  let left = byte;
  for (const [anchor, weight] of WEIGHTS) {
    if (left < weight) return anchor;
    left -= weight;
  }
  return "rocky";
}

/** The class of a world from its seed, a nature leaning a third of its worlds its own way. */
export function anchorOf(seed: Uint8Array, nature: Nature | null = null): Anchor {
  const [draw = 0, lean = 0, among = 0] = moreSeed(seed);
  if (nature === null || lean >= LEAN) return drawn(draw);
  const leaning = LEANS[nature];
  return leaning[among % leaning.length] ?? drawn(draw);
}

const holds = (functions: readonly string[], word: string) => functions.some((name) => name.includes(word));

function realmNature({ functions }: RealmFunctions): Nature | null {
  if (TOKEN.every((name) => functions.includes(name))) return "token";
  if (holds(functions, "Vote") && holds(functions, "Propos")) return "dao";
  return GAME.some((word) => holds(functions, word)) ? "game" : null;
}

/** What most of a world's realms are, a tie to the first rule. Names come capped from the worlds' schema: 512 realms of 256 at most. */
export function natureOf(realms: readonly RealmFunctions[]): Nature | null {
  const counts = new Map<Nature, number>();
  for (const realm of realms) {
    const nature = realmNature(realm);
    if (nature !== null) counts.set(nature, (counts.get(nature) ?? 0) + 1);
  }
  let found: Nature | null = null;
  for (const nature of NATURES)
    if ((counts.get(nature) ?? 0) > (found === null ? 0 : (counts.get(found) ?? 0))) found = nature;
  return found;
}
