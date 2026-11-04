import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keeps } from "./translationCheck.ts";

// ADR-0002 §5, point 5: "A translation may not add a link, a mention or a number that the original lacks; one that does is
// dropped and the original shows." Characters above ASCII are built from their code points.
const char = (...points: number[]) => String.fromCodePoint(...points);
const ADDRESS = "g1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9";
const OTHER = `g1${"l".repeat(38)}`;
const ORIGINAL = `The poll has 1,204 votes: see [it](https://gno.land/r/demo/poll) or ask @${ADDRESS}.`;

describe("keeps", () => {
  it("keeps a faithful translation: its link's label and the words translated, its facts as they were", () => {
    const french = `Le sondage a 1${char(0x202f)}204 votes${char(0xa0)}: voir [ici](https://gno.land/r/demo/poll) ou demandez ${char(0xe0)} @${ADDRESS}.`;
    expect(keeps(ORIGINAL, french)).toBe(true);
  });

  it("drops a translation that adds a link, bare or labelled, or changes one by a character", () => {
    expect(keeps(ORIGINAL, `${ORIGINAL} https://evil.example/claim`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} [claim](https://evil.example/claim)`)).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace("demo/poll", "demo/polls"))).toBe(false);
  });

  it.each([
    ["a quote", "\n\n> https://evil.example/claim"],
    ["a list", "\n\n- [claim](https://evil.example/claim)"],
    ["a strong mark", " **https://evil.example/claim**"],
    ["an emphasis", " _[claim](https://evil.example/claim)_"],
  ])("drops a translation that adds a link in %s", (_, added) => {
    expect(keeps(ORIGINAL, `${ORIGINAL}${added}`)).toBe(false);
  });

  it("drops a translation that adds an account, with its at sign or not, anywhere, or names the whole room", () => {
    expect(keeps(ORIGINAL, `${ORIGINAL} @${OTHER}`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} send to ${OTHER}`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} send to ${OTHER.toUpperCase()}`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} send to ${char(0x261)}${OTHER.slice(1)}`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} send to ${OTHER.slice(0, 9)}${char(0x200b)}${OTHER.slice(9)}`)).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace(ADDRESS, ADDRESS.toUpperCase()))).toBe(true);
    expect(keeps(ORIGINAL, `${ORIGINAL}\n\n> *@${OTHER}*`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} @room`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL}\n\n- **@room**`)).toBe(false);
    expect(keeps(`${ORIGINAL} @room`, `@room ${ORIGINAL}`)).toBe(true);
  });

  it("drops a translation that adds a number, anywhere, in any form, or splits one differently", () => {
    expect(keeps(ORIGINAL, `${ORIGINAL} 77`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} 1${char(0x200b)}2${char(0x200b)}0${char(0x200b)}4`)).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace("1,204", "-1,204"))).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace("1,204", `${char(0x2010)}1,204`))).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} 7${char(0x200a)}7`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} ${char(0x278a, 0x24ff)}`)).toBe(false);
    expect(keeps("11 GNOT", `1${char(0xbd)} GNOT`)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL}\n\n\`\`\`\n9999\n\`\`\``)).toBe(false);
    expect(keeps(ORIGINAL, `${ORIGINAL} ${char(0x2464, 0x24ea, 0x24ea)} GNOT`)).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace("1,204", "12,04"))).toBe(false);
    expect(keeps(ORIGINAL, ORIGINAL.replace("1,204", "1204"))).toBe(false);
    expect(keeps("1.5 GNOT", "15 GNOT")).toBe(false);
    expect(keeps("no figure", `${char(0x665)} figures`)).toBe(false);
  });

  it.each([
    ["1.204", "a dot"],
    ["1 204", "a space"],
    [`1${char(0x202f)}204`, "a narrow no-break space"],
    ["1'204", "an apostrophe"],
    [`1${char(0x2027)}204`, "a hyphenation point"],
    [`${char(0x661)}${char(0x66c)}${char(0x662, 0x660, 0x664)}`, "Arabic's digits and separator"],
  ])("keeps the same number written %j (%s)", (written) => {
    expect(keeps(ORIGINAL, ORIGINAL.replace("1,204", written))).toBe(true);
  });

  it("reads the original as what a source holds: a blank with a glyph's width parts its digits", () => {
    const braille = char(0x2800);
    expect(keeps(`2026${braille}100 voters`, "2026 100 votants")).toBe(true);
    expect(keeps(`2026${braille}100 voters`, "2026100 votants")).toBe(false);
  });

  it("keeps a translation that drops a link, a mention or a number: it adds none", () => {
    expect(keeps(ORIGINAL, "Le sondage.")).toBe(true);
    expect(keeps("1.5 GNOT", "1,5 GNOT")).toBe(true);
  });

  it("keeps any text as its own translation", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (text) => {
        expect(keeps(text, text)).toBe(true);
      }),
    );
  });

  it("keeps a translation whose hidden characters its original holds", () => {
    const joined = `Bravo ${char(0x1f469, 0x200d, 0x1f4bb)} 1,204 votes.`;
    expect(keeps(joined, `Well done ${char(0x1f469, 0x200d, 0x1f4bb)} 1,204 votes.`)).toBe(true);
  });
});
