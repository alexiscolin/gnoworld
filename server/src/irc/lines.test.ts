import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allowed, line } from "./lines.ts";

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
              /^SAMODE #[^\s,]+ (?:[+-][MmisR]|[+-]b m:[A-Za-z0-9_-]{1,64}|-I [^\s,]+|(?:[+-][Iv]|-[qaoh]) [^\s,*?!@#:][^\s,*?!@]*)\r\n$/,
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
});
