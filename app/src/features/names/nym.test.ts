import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NYM_PREFIX, NYM_RULE, nymProblem } from "./nym.ts";

// 9f: what follows `nym-` is checked before Adena opens against Register's first checks (recordings README): `^nym-[a-z]{5,13}\d{3}$`
// and a stem not starting with gl, g1, gno, atom, atone, photon or cosmos (`gi` is allowed). Role names and collisions are the
// chain's answer, shown as its error.
describe("nymProblem", () => {
  it.each(["alexis042", "abcde000", "abcdefghijklm999", "gismo123", "gigantic007"])("accepts %s", (typed) => {
    expect(nymProblem(typed)).toBeUndefined();
  });

  it.each([
    ["", "nothing typed"],
    ["alex042", "four letters"],
    ["abcdefghijklmn042", "fourteen letters"],
    ["alexis42", "two digits"],
    ["alexis0421", "four digits"],
    ["alexis", "no digits"],
    ["042042", "no letters"],
    ["Alexis042", "a capital"],
    ["alexis 042", "a space"],
    [" alexis042", "a leading space"],
    ["alexis042\n", "a newline"],
    ["alexis-042", "a dash"],
    ["alexïs042", "a letter outside a to z"],
    ["alexis٣٤٥", "digits outside 0 to 9"],
    ["nym-alexis042", "the prefix typed again"],
    ["alexis042.gno", "a suffix"],
  ])("refuses %j (%s) with the rule in words, before Adena", (typed) => {
    expect(nymProblem(typed)).toMatch(/5 to 13 letters, then 3 digits/);
  });

  it.each(["glenn042", "gnomes123", "atomic042", "atonement042", "photonic042", "cosmosfan042", "gloria042"])(
    "refuses %s: its stem starts with a reserved prefix",
    (typed) => {
      expect(nymProblem(typed)).toMatch(/reserved prefix/);
      expect(nymProblem(typed)).toMatch(/gl.*g1.*gno.*atom.*atone.*photon.*cosmos/);
    },
  );

  it("takes only the stem's start for a reserved prefix: a prefix inside it, or in the digits, is fine", () => {
    for (const typed of ["xxglxx042", "agnome042", "xatomx042"]) expect(nymProblem(typed)).toBeUndefined();
  });

  it("is the frames' one line, and the one prefix the dialog shows and the message signs", () => {
    expect(NYM_RULE).toBe("5 to 13 letters, then 3 digits. Example: nym-alexis042.");
    expect(NYM_PREFIX).toBe("nym-");
  });

  // The recording's rule written another way: count the leading letters, then exactly 3 ASCII digits and nothing after.
  it("agrees with the recording's rule for any text, and never throws", () => {
    const PREFIXES = ["gl", "g1", "gno", "atom", "atone", "photon", "cosmos"];
    const letter = (char: string) => char >= "a" && char <= "z";
    const digit = (char: string) => char >= "0" && char <= "9";
    const chain = (typed: string) => {
      let letters = 0;
      while (letter(typed.charAt(letters))) letters += 1;
      const tail = typed.slice(letters);
      return (
        letters >= 5 &&
        letters <= 13 &&
        tail.length === 3 &&
        Array.from(tail, digit).every(Boolean) &&
        !PREFIXES.some((prefix) => typed.startsWith(prefix))
      );
    };
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.stringMatching(/^[a-z]{3,15}[0-9]{2,4}$/)), (typed) => {
        expect(nymProblem(typed) === undefined).toBe(chain(typed));
      }),
    );
  });
});
