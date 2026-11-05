import { parseLine } from "@gnoworld/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allowed, line, said } from "./lines.ts";

describe("the link's own lines (3j's green pass)", () => {
  // Words near the forms, and any text.
  const word = fc.oneof(
    fc.constantFrom(
      ...["#bubble", "#a,#b", "+b", "-b", "+o+b", "+o", "m:g1a", "x:m:g1a", "m:*", "g1a", "", " ", "a b"],
      // 3l's and 3m's forms: the flags, invites, voices, powers and a KICK's reason.
      ...["+M", "-m", "+i", "-R", "+I", "-I", "+v", "-o", "-q", "*!*@*", "gnoworld", "not on this list"],
    ),
    fc.string({ unit: "binary", maxLength: 30 }),
  );

  it("writes any command it allows as one line of its form, or nothing", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("REDACT", "NOTICE", "SAMODE", "JOIN", "PRIVMSG", "KICK", "QUIT"),
        fc.array(word, { maxLength: 4 }),
        (command, params) => {
          if (!allowed(command, params)) return;
          let text: string;
          try {
            text = line(command, params);
          } catch {
            // formatLine refuses a line that would break in two: nothing is written.
            return;
          }
          expect(text.slice(0, -2)).not.toMatch(/[\r\n\0]/);
          expect(text.endsWith("\r\n")).toBe(true);
          const forms: Record<string, RegExp> = {
            SAMODE:
              /^SAMODE #[^\s,]+ (?:[+-][MmisR]|[+-]b m:[A-Za-z0-9_-]{1,64}|-I [^\s,]+|\+o gnoworld|(?:[+-][Iv]|-[qaoh]) [^\s,*?!@#:][^\s,*?!@]*)\r\n$/,
            REDACT: /^REDACT #[^\s,]+[ \r]/,
            NOTICE: /^NOTICE [^#,\s:][^\s,]*[ \r]/,
            JOIN: /^JOIN #[^\s,]+\r\n$/,
            KICK: /^KICK #[^\s,]+ [^\s,*?!@#:][^\s,*?!@]* :?\S.*\r\n$/,
          };
          const form = forms[command];
          expect(form).toBeDefined();
          expect(text).toMatch(form ?? /^$/);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("sends a NOTICE to an account's shape alone, never a server mask nor a room's prefix (F655)", () => {
    const to = (target: string): boolean => allowed("NOTICE", [target, "x"]);
    // $ reaches every user, @# + # and %# a room's operators, voices or half-ops; then a dot, a space, a letter
    // past ASCII, and one character too many.
    expect(
      ["$*", "$$*", "$#*", "@#bubble", "+#bubble", "%#bubble", "g1a.b", "a b", "é", "x".repeat(65)].map(to),
    ).toEqual(Array<boolean>(10).fill(false));
    expect(["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "alice", "a-b_c", "x".repeat(64)].map(to)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("allows the bot's own op on a room, and no other power of its own (the max review)", () => {
    expect(allowed("SAMODE", ["#bubble", "+o", "gnoworld"])).toBe(true);
    expect(
      [
        ["#bubble", "-o", "gnoworld"],
        ["#bubble", "+v", "gnoworld"],
        ["#bubble", "+q", "gnoworld"],
        ["#bubble", "+o", "gnoworld", "extra"],
        ["bubble", "+o", "gnoworld"],
        ["#bubble", "+o", "g1a"],
      ].map((params) => allowed("SAMODE", params)),
    ).toEqual(Array<boolean>(6).fill(false));
  });

  it("allows a room flag alone, never inside a longer mode, and a KICK with its reason and nothing after (F570)", () => {
    expect(["+M", "-i", "+o+M", "x+M", "+M+o", "+MM"].map((mode) => allowed("SAMODE", ["#bubble", mode]))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect([
      allowed("KICK", ["#bubble", "g1a", "not on this room's list"]),
      allowed("KICK", ["#bubble", "g1a", "not on this room's list", "extra"]),
    ]).toEqual([true, false]);
  });
});

describe("the speaker's country on a line (8i)", () => {
  const countryOf = (tag: string | undefined): string | undefined => {
    const tags = `account=ada;msgid=m1${tag === undefined ? "" : `;+gnoworld/country=${tag}`}`;
    const parsed = parseLine(`@${tags} :ada!u@h PRIVMSG #bubble :hi`);
    return parsed.ok ? said(parsed.message, new Set(["#bubble"]))?.country : "unparsed";
  };

  it("reads a country from two capitals alone", () => {
    expect(countryOf("FR")).toBe("FR");
  });

  it("declares none when the tag is absent, lower case, too long, too short, or no letters", () => {
    const refused = [undefined, "", "fr", "Fr", "FRA", "F", "F1", "1F", String.raw`F\sR`, String.raw`FR\n`];
    expect(refused.map(countryOf)).toEqual(Array<undefined>(refused.length).fill(undefined));
  });
});
