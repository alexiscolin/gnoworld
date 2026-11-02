import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  anchorOf,
  ANCHORS,
  asciiBytes,
  natureOf,
  planetLook,
  planetSeed,
  worldLook,
  type Anchor,
  type Nature,
  type RealmFunctions,
} from "./look.ts";
import { sha256 } from "./sha256.ts";

// Which of the twelve a world is (slice 7, 7b2; ADR-0002 §3). All 32 bytes of the seed are taken (F3476), so the choice reads a second
// hash, and the anchor's look stands as the lab showed it: a world is `planetLook` at the anchor its seed chose.
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
const LEANS = {
  token: ["gas giant", "ice giant"],
  dao: ["temperate"],
  game: ["volcanic", "tidally locked", "shattered"],
} as const satisfies Record<Nature, readonly Anchor[]>;
// A nudge takes the bytes under this, of 256: about a third of a nature's worlds.
const LEAN = 90;
const NATURES = ["token", "dao", "game"] as const;

const drawn = (byte: number): Anchor => {
  let left = byte;
  for (const [anchor, weight] of WEIGHTS) {
    if (left < weight) return anchor;
    left -= weight;
  }
  throw new Error("the weights do not reach 256");
};
const byteOf = (bytes: Uint8Array, index: number): number => {
  const byte = bytes[index];
  if (byte === undefined) throw new Error("no such byte");
  return byte;
};
const seeds = (count: number): Uint8Array[] =>
  Array.from({ length: count }, (_, at) => planetSeed(asciiBytes(`gno.land/r/n${String(at)}/home`)));
const shareOf = (anchors: readonly Anchor[], wanted: readonly Anchor[]) =>
  anchors.filter((anchor) => wanted.includes(anchor)).length / anchors.length;

// Exported names read on onyx-1 with gnomcp's gno_read, 2026-11-02.
const WUGNOT = ["Deposit", "Withdraw", "Render", "TotalSupply", "BalanceOf", "Allowance", "Transfer", "Approve"];
const GOV_DAO = ["Render", "MustCreateProposal", "ExecuteProposal", "CreateProposal", "VoteOnProposal", "UpdateImpl"];
const CONNECT4 = ["Offer", "Accept", "Reveal", "RevealSeed", "Play", "ClaimTimeout", "Resign", "Cancel", "Render"];
const realm = (functions: readonly string[]): RealmFunctions => ({ functions });

describe("anchorOf", () => {
  it("weighs the twelve as stated, on a second hash of the seed: a byte of the seed's own is another value's (F3476)", () => {
    expect(WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)).toBe(256);
    expect(WEIGHTS.map(([anchor]) => anchor)).toEqual(ANCHORS);
    for (const seed of seeds(5000)) expect(anchorOf(seed)).toBe(drawn(byteOf(sha256(seed), 0)));
  });

  it("gives every anchor some worlds, and keeps the strange ones rare, about one in ten (ADR-0002 §3)", () => {
    const anchors = seeds(6000).map((seed) => anchorOf(seed));
    expect(new Set(anchors)).toEqual(new Set(ANCHORS));
    const strange = shareOf(anchors, ["tidally locked", "shattered"]);
    expect(strange).toBeGreaterThan(0.07);
    expect(strange).toBeLessThan(0.13);
    for (const anchor of ANCHORS.filter((one) => one !== "tidally locked" && one !== "shattered"))
      expect(shareOf(anchors, [anchor]), anchor).toBeGreaterThan(0.06);
  });

  it("gives a seed one anchor, whatever asks", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (seed) => {
        expect(ANCHORS).toContain(anchorOf(seed));
        expect(anchorOf(seed)).toBe(anchorOf(Uint8Array.from(seed)));
        expect(anchorOf(seed, null)).toBe(anchorOf(seed));
      }),
    );
  });

  // Computed apart with Python's hashlib: a change of byte or weight re-rolls every world, and this says so.
  it.each([
    ["gov/dao", 139, "volcanic"],
    ["gnoswap/pool", 171, "gas giant"],
    ["nym-alexiscolin000/gnogolf", 5, "rocky"],
    ["samcrew/memba", 188, "ice giant"],
    ["gnoland/wugnot", 225, "tidally locked"],
    ["samcrew/connect4", 37, "temperate"],
  ] as const)("keeps %s's class", (id, byte, anchor) => {
    const seed = planetSeed(asciiBytes(`gno.land/r/${id}`));
    expect(byteOf(sha256(seed), 0)).toBe(byte);
    expect(anchorOf(seed)).toBe(anchor);
  });
});

describe("a world's nature nudges its class", () => {
  it.each(NATURES)("%s takes the bytes under the lean, and the stated classes", (nature) => {
    for (const seed of seeds(3000)) {
      const more = sha256(seed);
      const leaning = LEANS[nature];
      const expected = byteOf(more, 1) < LEAN ? leaning[byteOf(more, 2) % leaning.length] : drawn(byteOf(more, 0));
      expect(anchorOf(seed, nature)).toBe(expected);
    }
  });

  it("moves a world whose bytes fall under the lean, and leaves the others: hashlib's bytes for two recorded worlds", () => {
    const seedOf = (id: string) => planetSeed(asciiBytes(`gno.land/r/${id}`));
    expect(anchorOf(seedOf("gnoland/wugnot"), "token")).toBe("gas giant");
    expect(anchorOf(seedOf("nym-vikbez000/nightsky"), "dao")).toBe("temperate");
    expect(anchorOf(seedOf("gov/dao"), "dao")).toBe("volcanic");
    expect(anchorOf(seedOf("nym-vikbez000/nightsky"), "token")).toBe("ice giant");
    expect(anchorOf(seedOf("nym-vikbez000/nightsky"), "game")).toBe("shattered");
    expect(anchorOf(seedOf("gnoland/wugnot"), "game")).toBe("shattered");
  });

  it.each(NATURES)("%s leans without fixing: every class stays open to it", (nature) => {
    const anchors = seeds(6000).map((seed) => anchorOf(seed, nature));
    expect(new Set(anchors)).toEqual(new Set(ANCHORS));
    const neutral = seeds(6000).map((seed) => anchorOf(seed));
    expect(shareOf(anchors, LEANS[nature])).toBeGreaterThan(shareOf(neutral, LEANS[nature]) + 0.25);
  });

  it.each(NATURES)("%s moves about a third of its worlds at most, so a misread nature costs little", (nature) => {
    const all = seeds(6000);
    const moved = all.filter((seed) => anchorOf(seed, nature) !== anchorOf(seed)).length;
    expect(moved / all.length).toBeLessThan(0.36);
  });
});

describe("natureOf", () => {
  it("reads a token, a DAO and a game from names read on the chain", () => {
    expect(natureOf([realm(WUGNOT)])).toBe("token");
    expect(natureOf([realm(GOV_DAO)])).toBe("dao");
    expect(natureOf([realm(CONNECT4)])).toBe("game");
  });

  it("calls nothing what no rule reads", () => {
    expect(natureOf([])).toBeNull();
    expect(natureOf([realm([])])).toBeNull();
    expect(natureOf([realm(["Render", "Increment"])])).toBeNull();
  });

  it.each(["Transfer", "Approve", "BalanceOf", "TotalSupply"])(
    "wants all four of a token's names, %s too",
    (missing) => {
      const names = ["Transfer", "Approve", "BalanceOf", "TotalSupply"].filter((name) => name !== missing);
      expect(natureOf([realm(names)])).toBeNull();
    },
  );

  it("wants both a vote and a proposal for a DAO", () => {
    expect(natureOf([realm(["CastVote"])])).toBeNull();
    expect(natureOf([realm(["NewProposal"])])).toBeNull();
    expect(natureOf([realm(["CastVote", "NewProposal"])])).toBe("dao");
    expect(natureOf([realm(["Propose", "CastVote"])])).toBe("dao");
    expect(natureOf([realm(["VoteOnProposal"])])).toBe("dao");
  });

  it.each(["Play", "Move", "Guess", "Shot", "Lobby", "Game", "Challenge"])(
    "reads a game from a name holding %s",
    (word) => {
      expect(natureOf([realm([`New${word}Now`])])).toBe("game");
    },
  );

  it("is case-sensitive: Remove is no Move", () => {
    expect(natureOf([realm(["Remove", "display"])])).toBeNull();
  });

  it("takes the first rule that matches a realm: token, then DAO, then game", () => {
    expect(natureOf([realm([...WUGNOT, ...GOV_DAO, "Play"])])).toBe("token");
    expect(natureOf([realm([...GOV_DAO, "Play"])])).toBe("dao");
  });

  it("gives a world the nature most of its realms have, and ties to the first rule", () => {
    expect(natureOf([realm(WUGNOT), realm(CONNECT4), realm(CONNECT4)])).toBe("game");
    expect(natureOf([realm(CONNECT4), realm(GOV_DAO)])).toBe("dao");
    expect(natureOf([realm(CONNECT4), realm(WUGNOT)])).toBe("token");
    expect(natureOf([realm(GOV_DAO), realm(CONNECT4)])).toBe("dao");
    expect(natureOf([realm(WUGNOT), realm(CONNECT4)])).toBe("token");
    expect(natureOf([realm(CONNECT4), realm(GOV_DAO), realm(WUGNOT)])).toBe("token");
    expect(natureOf([realm(["Render"]), realm(["Render"]), realm(CONNECT4)])).toBe("game");
  });

  it("reads a world the same whatever the order of its realms", () => {
    const realms = fc.constantFrom(WUGNOT, GOV_DAO, CONNECT4, ["Render"]).map((names) => realm(names));
    fc.assert(
      fc.property(fc.array(realms, { maxLength: 7 }), fc.nat(), (list, by) => {
        const turned = [...list.slice(by % (list.length + 1)), ...list.slice(0, by % (list.length + 1))];
        expect(natureOf(turned)).toBe(natureOf(list));
        expect(natureOf([...list].reverse())).toBe(natureOf(list));
      }),
    );
  });

  it("holds on any names a chain could carry", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string({ maxLength: 128 }), { maxLength: 8 }), { maxLength: 8 }), (names) => {
        const nature = natureOf(names.map((functions) => realm(functions)));
        expect([null, ...NATURES]).toContain(nature);
      }),
    );
  });
});

describe("worldLook", () => {
  it("spells a text's bytes for a seed: an id is ASCII by its schema", () => {
    expect([...asciiBytes("a/z-0")]).toEqual([97, 47, 122, 45, 48]);
    expect([...asciiBytes("")]).toEqual([]);
    expect([...asciiBytes("~")]).toEqual([126]);
  });

  it.each(["é", "gnoswap/é", "\u0080", "\u0100", "a\u{1F30D}"])(
    "refuses %s: past ASCII a code unit would wrap, and two ids would be one planet",
    (text) => {
      expect(() => asciiBytes(text)).toThrow(RangeError);
    },
  );

  it("reads the world's look at its path on gno.land, at the anchor its seed chose", () => {
    const id = "gnoswap/pool";
    const path = asciiBytes(`gno.land/r/${id}`);
    expect(worldLook(id)).toEqual(planetLook(path, anchorOf(planetSeed(path))));
  });

  it("passes the nature on", () => {
    const id = "gnoswap/pool";
    const path = asciiBytes(`gno.land/r/${id}`);
    for (const nature of NATURES)
      expect(worldLook(id, nature)).toEqual(planetLook(path, anchorOf(planetSeed(path), nature)));
  });

  it("gives a path one planet", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9]{1,24}(?:\/[a-z0-9]{1,24}){0,2}$/), (id) => {
        expect(worldLook(id)).toEqual(worldLook(id));
      }),
    );
  });
});
