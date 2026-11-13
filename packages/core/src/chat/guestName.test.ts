import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GUEST_ADJECTIVES, GUEST_ANIMALS, GUEST_NAME_BYTES, GUEST_PREFIX, guestName } from "./guestName.ts";

// Ergo's nicklen (deploy/ergo/ircd.yaml.tmpl), the slash of "anon/" included.
const NICKLEN = 32;
const bytes = fc.uint8Array({ minLength: GUEST_NAME_BYTES, maxLength: GUEST_NAME_BYTES });

describe("the guest's word lists", () => {
  it("hold about 200 adjectives and 200 animals, so a name has room to be unique", () => {
    expect(GUEST_ADJECTIVES.length).toBeGreaterThanOrEqual(200);
    expect(GUEST_ANIMALS.length).toBeGreaterThanOrEqual(200);
  });

  it("are plain lower case ASCII letters, each word once, never in both lists", () => {
    for (const list of [GUEST_ADJECTIVES, GUEST_ANIMALS]) {
      expect(list.filter((word) => !/^[a-z]{2,10}$/.test(word))).toEqual([]);
      expect(new Set(list).size).toBe(list.length);
    }
    expect(GUEST_ADJECTIVES.filter((word) => GUEST_ANIMALS.includes(word))).toEqual([]);
  });

  it("never hold a word a room could read as the server's own voice", () => {
    expect([...GUEST_ADJECTIVES, ...GUEST_ANIMALS].filter((word) => /gnoworld|admin|guest|anon/.test(word))).toEqual(
      [],
    );
  });

  it("fit Ergo's nick length with the longest of each: anon/<adjective>-<animal>-<4> is 32 characters at most", () => {
    const longest = (list: readonly string[]): number => Math.max(...list.map((word) => word.length));
    expect(GUEST_PREFIX.length + longest(GUEST_ADJECTIVES) + 1 + longest(GUEST_ANIMALS) + 1 + 4).toBeLessThanOrEqual(
      NICKLEN,
    );
  });
});

describe("guestName", () => {
  it("is <adjective>-<animal>-<4 base32 characters>, whatever the bytes", () => {
    fc.assert(
      fc.property(bytes, (draw) => {
        const [adjective = "", animal = "", suffix = "", ...more] = guestName(draw).split("-");
        expect(more).toEqual([]);
        expect(GUEST_ADJECTIVES).toContain(adjective);
        expect(GUEST_ANIMALS).toContain(animal);
        expect(suffix).toMatch(/^[a-z2-7]{4}$/);
      }),
    );
  });

  it("gives a nick Ergo takes, 32 characters at most with its prefix, for any bytes", () => {
    fc.assert(
      fc.property(bytes, (draw) => {
        const name = guestName(draw);
        expect(name).not.toBe("");
        expect((GUEST_PREFIX + name).length).toBeLessThanOrEqual(NICKLEN);
      }),
    );
  });

  it("is pure: the same bytes give the same name, other bytes another", () => {
    const a = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(guestName(a)).toBe(guestName(Uint8Array.from(a)));
    expect(guestName(Uint8Array.from([9, 2, 3, 4, 5, 6, 7, 8]))).not.toBe(guestName(a));
  });

  it("reaches every adjective and every animal, so no word of a list is dead", () => {
    const seen = { adjectives: new Set<string>(), animals: new Set<string>() };
    // A fixed xorshift stream, not chance: the test holds no clock and no random.
    let x = 2463534242;
    const next = (): number => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x & 255;
    };
    for (let n = 0; n < 20_000; n += 1) {
      const draw = Uint8Array.from({ length: GUEST_NAME_BYTES }, next);
      const [adjective = "", animal = ""] = guestName(draw).split("-");
      seen.adjectives.add(adjective);
      seen.animals.add(animal);
    }
    expect(seen.adjectives.size).toBe(GUEST_ADJECTIVES.length);
    expect(seen.animals.size).toBe(GUEST_ANIMALS.length);
  });

  it("refuses fewer bytes than it needs, so a short draw never gives a name made of zeros", () => {
    expect(() => guestName(new Uint8Array(GUEST_NAME_BYTES - 1))).toThrow(RangeError);
    expect(() => guestName(new Uint8Array(0))).toThrow(RangeError);
  });
});
