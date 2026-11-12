import { GUEST_ADJECTIVES, GUEST_ANIMALS, GUEST_NAME_BYTES, GUEST_PREFIX, guestName, parseLine } from "@gnoworld/core";
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

describe("the bot's relayed lines (D430)", () => {
  const ROOM = "#earth";
  const NICK_OK = "anon/brave-otter-ab23";

  it("allows RELAYMSG in the one shape the route builds: a room, a guest's nick, a one-line text", () => {
    expect(allowed("RELAYMSG", [ROOM, NICK_OK, "hello"])).toBe(true);
    expect(allowed("RELAYMSG", ["#earth/kyoto", NICK_OK, "a : colon, and :: more"])).toBe(true);
  });

  it("refuses a nick that is not anon/<word>-<word>-<4 base32>: a real account's, the bot's, a wildcard, a longer one", () => {
    const nicks = [
      "alice",
      "gnoworld",
      "anon/",
      "anon/x",
      "anon/Brave-otter-ab23",
      "anon/brave-otter-ab2",
      "anon/brave-otter-ab23x",
      "anon/brave-otter-ab18",
      "anon/brave otter-ab23",
      "anon/brave-otter-ab23,alice",
      "anon/*",
      "#anon/brave-otter-ab23",
      "anon//brave-otter-ab23",
      `anon/${"a".repeat(14)}-${"b".repeat(14)}-ab23`,
    ];
    expect(nicks.map((nick) => allowed("RELAYMSG", [ROOM, nick, "hi"]))).toEqual(
      Array<boolean>(nicks.length).fill(false),
    );
  });

  it("refuses a room that is no room by the JOIN's form, and a direct target", () => {
    expect(
      ["alice", "earth", "#", "#a b", "#a,#b", "*"].map((room) => allowed("RELAYMSG", [room, NICK_OK, "hi"])),
    ).toEqual(Array<boolean>(6).fill(false));
  });

  it("refuses an empty text, a blank one, a CR, an LF or a NUL in it, and any parameter after the text", () => {
    const texts = ["", "   ", "a\rb", "a\nb", "a\u0000b", "a\r\nPRIVMSG #earth :x"];
    expect(texts.map((text) => allowed("RELAYMSG", [ROOM, NICK_OK, text]))).toEqual(Array<boolean>(6).fill(false));
    expect(allowed("RELAYMSG", [ROOM, NICK_OK, "hi", "extra"])).toBe(false);
    expect(allowed("RELAYMSG", [ROOM, NICK_OK])).toBe(false);
  });

  it("writes the line with the text as its trailing parameter, so a text starting with a colon or a space cannot become a command", () => {
    expect(line("RELAYMSG", [ROOM, NICK_OK, ":PRIVMSG x :y"])).toBe(`RELAYMSG ${ROOM} ${NICK_OK} ::PRIVMSG x :y\r\n`);
    expect(line("RELAYMSG", [ROOM, NICK_OK, "two words"])).toBe(`RELAYMSG ${ROOM} ${NICK_OK} :two words\r\n`);
  });

  const heard = (raw: string) => {
    const parsed = parseLine(raw);
    return parsed.ok ? said(parsed.message, new Set([ROOM])) : "unparsed";
  };

  it("never hands on a relayed line, the bot's own echo of it or the room's history of it: it was judged before it was said", () => {
    const source = `${NICK_OK}!~u@gnoworld.cloak`;
    // As Ergo sends them: the relay's tag, no account (the line is the bot's, spoken for a guest), then with an account.
    expect(heard(`@draft/relaymsg=gnoworld;msgid=m1 :${source} PRIVMSG ${ROOM} :hello`)).toBeUndefined();
    expect(
      heard(`@draft/relaymsg=gnoworld;account=gnoworld;msgid=m1 :${source} PRIVMSG ${ROOM} :hello`),
    ).toBeUndefined();
    expect(heard(`@account=gnoworld;msgid=m1 :${source} PRIVMSG ${ROOM} :no tag, a history page's`)).toBeUndefined();
    expect(
      heard(`@draft/relaymsg=gnoworld;account=gnoworld;msgid=m1 :${source} NOTICE ${ROOM} :hello`),
    ).toBeUndefined();
  });

  it("still hands on an account's line, so the filter is the relayed nick's, not any line with an account", () => {
    expect(heard(`@account=ada;msgid=m2 :ada!u@h PRIVMSG ${ROOM} :hi`)).toMatchObject({ account: "ada", text: "hi" });
  });

  it("hands on no line whose source nick holds the relay's slash, whatever its tags say (a forged tag cannot make it an account's)", () => {
    expect(heard(`@account=ada;msgid=m3 :anon/x-y-aaaa!u@h PRIVMSG ${ROOM} :hi`)).toBeUndefined();
  });
});

describe("the relay's line fits IRC and carries what the server builds (D430)", () => {
  const NICK = "anon/brave-otter-ab23";
  const prefix = (room: string, nick: string): number => Buffer.byteLength(`RELAYMSG ${room} ${nick} :`);

  it("allows a line of exactly 510 bytes and refuses 511, counted in bytes, never characters", () => {
    const room = `#${"a".repeat(63)}`;
    const text = (bytes: number): string => "é".repeat(Math.floor(bytes / 2)) + "a".repeat(bytes % 2);
    const room510 = 510 - prefix(room, NICK);
    expect(allowed("RELAYMSG", [room, NICK, text(room510)])).toBe(true);
    expect(allowed("RELAYMSG", [room, NICK, text(room510 + 1)])).toBe(false);
    expect(allowed("RELAYMSG", ["#earth", NICK, "x".repeat(510 - prefix("#earth", NICK))])).toBe(true);
    expect(allowed("RELAYMSG", ["#earth", NICK, "x".repeat(511 - prefix("#earth", NICK))])).toBe(false);
  });

  it("keeps a guest's longest line, 400 bytes, with the longest room and the longest nick, under 510", () => {
    const room = `#${"a".repeat(63)}`;
    const longest = `${GUEST_PREFIX}${"a".repeat(10)}-${"b".repeat(10)}-ab23`;
    expect(allowed("RELAYMSG", [room, longest, "x".repeat(400)])).toBe(true);
    expect(prefix(room, longest) + 400).toBeLessThanOrEqual(510);
  });

  it("refuses every control character in the text, a CTCP's \u0001 and a DEL included, and takes a tab-free plain line", () => {
    const refused = ["\u0001", "\u0007", "\u001b", "\u007f", "\t", "\u0000"].map((c) =>
      allowed("RELAYMSG", ["#earth", NICK, `a${c}b`]),
    );
    expect(refused).toEqual(Array<boolean>(6).fill(false));
    expect(allowed("RELAYMSG", ["#earth", NICK, "plain, with : colons"])).toBe(true);
  });

  it("refuses a lone surrogate, which no line can carry, and any text with a CR LF in it", () => {
    expect(["a\ud800b", "\udc00", "a\r\nQUIT"].map((text) => allowed("RELAYMSG", ["#earth", NICK, text]))).toEqual([
      false,
      false,
      false,
    ]);
    expect(allowed("RELAYMSG", ["#earth", NICK, "fine 😀"])).toBe(true);
  });

  it("allows the nick guestName makes, for any 8 bytes: the name's builder and the line's form never drift apart", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: GUEST_NAME_BYTES, maxLength: GUEST_NAME_BYTES }), (bytes) => {
        expect(allowed("RELAYMSG", ["#earth", GUEST_PREFIX + guestName(bytes), "hi"])).toBe(true);
      }),
    );
  });

  it("allows the nick of the longest adjective and the longest animal of the lists, and every word of both", () => {
    const longest = (list: readonly string[]): string => list.reduce((a, b) => (b.length > a.length ? b : a), "");
    const nick = `${GUEST_PREFIX}${longest(GUEST_ADJECTIVES)}-${longest(GUEST_ANIMALS)}-zz77`;
    expect(allowed("RELAYMSG", ["#earth", nick, "hi"])).toBe(true);
    expect(nick.length).toBeLessThanOrEqual(32);
    for (const word of [...GUEST_ADJECTIVES, ...GUEST_ANIMALS])
      expect(allowed("RELAYMSG", ["#earth", `${GUEST_PREFIX}${word}-${word}-aa22`, "hi"])).toBe(true);
  });
});

describe("Jarvis's one nick (the relay form)", () => {
  const relay = (nick: string): boolean => allowed("RELAYMSG", ["#bubble", nick, "It closes today."]);

  it("relayForm accepts jarvis/bot and no other nick with a slash", () => {
    expect(relay("jarvis/bot")).toBe(true);
    for (const nick of ["jarvis/bot2", "jarvis/bo", "Jarvis/bot", "jarvis/Bot", "admin/bot", "a/b", "jarvis/", "/bot"])
      expect(relay(nick)).toBe(false);
  });

  it("a guest cannot relay as jarvis/bot", () => {
    expect(relay("jarvis/bot")).toBe(true);
    for (const nick of [
      `${GUEST_PREFIX}jarvis/bot`,
      " jarvis/bot",
      "jarvis/bot ",
      "jarvis/bot\n",
      "jarvis/bot:x",
      `${GUEST_PREFIX}jarvis-bot-aaaa/bot`,
    ])
      expect(relay(nick)).toBe(false);
    expect(allowed("RELAYMSG", ["#bubble", "jarvis/bot", "two\nlines"])).toBe(false);
    expect(allowed("RELAYMSG", ["#bubble", "jarvis/bot", "x".repeat(600)])).toBe(false);
  });
});
