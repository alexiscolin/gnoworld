import { describe, expect, it } from "vitest";
import { CAPTURE_MAX_BYTES, Previews, PREVIEWS_MAX, PREVIEWS_MAX_BYTES } from "./previews.ts";

// The file the server's preview job writes and every client reads (8f, slice 7's 7l): each captured page by its realm's path, the time it
// was captured and its first part as the chain rendered it. All of it came from a chain, so every text is capped and every path is a realm's.
const capture = (over: Record<string, unknown> = {}) => ({
  path: "gno.land/r/gov/dao",
  captured: "2026-11-05T10:00:00.000Z",
  text: "# GovDAO\n## Proposals\n",
  ...over,
});
const file = (over: Record<string, unknown> = {}) => ({
  version: 1,
  universe: "onyx",
  updated: "2026-11-05T10:00:01.000Z",
  previews: [capture()],
  ...over,
});
const parses = (value: unknown): boolean => Previews.safeParse(value).success;

describe("Previews, the captures' file", () => {
  it("takes a file of one capture, and one of none", () => {
    expect(parses(file())).toBe(true);
    expect(parses(file({ previews: [] }))).toBe(true);
  });

  it("caps a capture at 4,096, a file at 32 captures and 1 MiB, as the plan states them", () => {
    expect(CAPTURE_MAX_BYTES).toBe(4096);
    expect(PREVIEWS_MAX).toBe(32);
    expect(PREVIEWS_MAX_BYTES).toBe(1_048_576);
  });

  // The job cuts a page at its cap in UTF-8 bytes, never more units than bytes: a reader refuses a text of more units than that.
  it("takes a text of exactly its cap and refuses one unit more, and refuses an empty text", () => {
    const ascii = "a".repeat(4096);
    expect(parses(file({ previews: [capture({ text: ascii })] }))).toBe(true);
    expect(parses(file({ previews: [capture({ text: `${ascii}a` })] }))).toBe(false);
    expect(parses(file({ previews: [capture({ text: "" })] }))).toBe(false);
  });

  it("refuses a path past 256 characters, the longest a realm's path may be", () => {
    const at = (length: number) => `gno.land/r/a/${"b".repeat(length - "gno.land/r/a/".length)}`;
    expect(parses(file({ previews: [capture({ path: at(256) })] }))).toBe(true);
    expect(parses(file({ previews: [capture({ path: at(257) })] }))).toBe(false);
  });

  it.each([
    ["a package, not a realm", "gno.land/p/nt/avl/v0"],
    ["an address", "https://onyx.testnets.gno.land/r/gov/dao"],
    ["a realm's sub-page", "gno.land/r/gov/dao:37"],
    ["a path with a query", "gno.land/r/gov/dao?page=2"],
    ["a test realm", "gno.land/r/gov/dao_test"],
    ["another site", "evil.example/r/gov/dao"],
  ])("refuses a capture of %s", (_, path) => {
    expect(parses(file({ previews: [capture({ path })] }))).toBe(false);
  });

  it(`holds ${String(PREVIEWS_MAX)} captures at most`, () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => capture({ path: `gno.land/r/demo/p${String(i).padStart(3, "0")}` }));
    expect(parses(file({ previews: many(PREVIEWS_MAX) }))).toBe(true);
    expect(parses(file({ previews: many(PREVIEWS_MAX + 1) }))).toBe(false);
  });

  it("refuses two captures of one page, and captures out of their paths' order", () => {
    expect(parses(file({ previews: [capture(), capture()] }))).toBe(false);
    const a = capture({ path: "gno.land/r/a/one" });
    const b = capture({ path: "gno.land/r/b/two" });
    expect(parses(file({ previews: [a, b] }))).toBe(true);
    expect(parses(file({ previews: [b, a] }))).toBe(false);
  });

  // The job writes its paths in JavaScript's own order of code units, the one sort() gives: `-` before `/` before `_` (R4).
  it("takes sibling paths with -, / and _ in the one order sort() gives, and no other", () => {
    const siblings = ["gno.land/r/a-b", "gno.land/r/a/b", "gno.land/r/a_b"];
    expect(siblings.toSorted()).toEqual(siblings);
    expect(parses(file({ previews: siblings.map((path) => capture({ path })) }))).toBe(true);
    expect(parses(file({ previews: siblings.toReversed().map((path) => capture({ path })) }))).toBe(false);
    expect(parses(file({ previews: [siblings[1], siblings[0], siblings[2]].map((path) => capture({ path })) }))).toBe(
      false,
    );
  });

  it.each([
    ["another version", { version: 2 }],
    ["a universe that is no slug", { universe: "Onyx Testnet" }],
    ["a time with no offset", { updated: "2026-11-05 10:00" }],
    ["a key it does not know", { extra: true }],
  ])("refuses %s", (_, over) => {
    expect(parses(file(over))).toBe(false);
  });

  it("refuses a capture with a key it does not know, or a time that is none", () => {
    expect(parses(file({ previews: [capture({ image: "https://evil.example/a.png" })] }))).toBe(false);
    expect(parses(file({ previews: [capture({ captured: "yesterday" })] }))).toBe(false);
  });

  it("holds its largest file under the bytes a client reads, even with every byte of every text escaped", () => {
    // A quote escapes to two bytes in JSON, a control character to six: the worst text weighs six times its cap.
    const worst = file({
      updated: "2026-11-05T10:00:01.000+14:00",
      previews: Array.from({ length: PREVIEWS_MAX }, (_, i) =>
        capture({
          path: `gno.land/r/${"n".repeat(120)}${String(i).padStart(3, "0")}/${"x".repeat(120)}`,
          captured: "2026-11-05T10:00:00.000+14:00",
          text: "\u0001".repeat(CAPTURE_MAX_BYTES),
        }),
      ),
    });
    expect(parses(worst)).toBe(true);
    // Every character of this file is ASCII once written: its length is its bytes.
    expect(JSON.stringify(worst).length).toBeLessThanOrEqual(PREVIEWS_MAX_BYTES);
  });
});
