// Which of the 24 a world is, and which other mixes under it (ADR-0002 §3). Every byte of the seed feeds a look (F3476), so the class
// reads a second hash of it. The strange ones stay rare, about one world in ten. A nature leans a world without fixing it, and is never
// shown: its rules read real realms right most of the time, not always (.claude/tmp/slice-7/reports/chain-feasibility.md and
// slice-7b4-natures.md), so an error must cost nothing. Tier 1 (docs/REVIEW.md).
import type { Anchor } from "./anchors.ts";
import { sha256 } from "./sha256.ts";

/** What a nudge reads, in the order its rules are tried: the rest of a realm's nature leans nowhere, and `/p/` packages make no world. */
export const NATURES = ["nft", "token", "exchange", "dao", "name", "game"] as const;
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
// Each nature to anchors of its own: tokens to the giants, DAOs to temperate worlds and games to fire and the strange ones (ADR-0002 §3);
// NFTs to the jewel-like ices, exchanges to the seas, names to old ground (Alexis, 2026-11-02).
const LEANS: Record<Nature, readonly [Anchor, ...Anchor[]]> = {
  nft: ["nitrogen ice", "grooved ice"],
  token: ["gas giant", "ice giant", "water cloud giant", "azure giant"],
  exchange: ["ocean", "hycean"],
  dao: ["temperate"],
  name: ["rocky", "desert"],
  game: ["volcanic", "tidally locked", "shattered", "lava world", "two-faced", "hot giant"],
};
// The bytes under this, of 256, take a nature's lean: about a third, so a misread nature moves a third of its worlds at most.
const LEAN = 90;
const MINOR_WORD = 26;
const TOKEN = ["Transfer", "Approve", "BalanceOf", "TotalSupply"];
const GAME = ["Play", "Move", "Guess", "Shot", "Lobby", "Game", "Challenge"];
const LOOKUP = ["Resolve", "Lookup", "Available", "HandleOf", "OwnerOf", "ByName"];

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
const names = (functions: readonly string[], ...wanted: string[]) => wanted.some((name) => functions.includes(name));

// Each nature's rule on a realm's own names, in NATURES' order: the first that reads it wins.
const RULES: Record<Nature, (functions: readonly string[]) => boolean> = {
  nft: (functions) => names(functions, "OwnerOf", "MustOwnerOf") && names(functions, "TokenURI", "Mint"),
  token: (functions) => TOKEN.every((name) => functions.includes(name)),
  exchange: (functions) =>
    holds(functions, "Swap") || (functions.includes("AddLiquidity") && functions.includes("RemoveLiquidity")),
  dao: (functions) => holds(functions, "Vote") && holds(functions, "Propos"),
  name: (functions) => holds(functions, "Register") && LOOKUP.some((word) => holds(functions, word)),
  game: (functions) => GAME.some((word) => holds(functions, word)),
};

const realmNature = ({ functions }: RealmFunctions): Nature | null =>
  NATURES.find((nature) => RULES[nature](functions)) ?? null;

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
