import type { DatabaseSync } from "node:sqlite";
import { PINS_MAX } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import type { Fetched, Said } from "../irc/link.ts";
import { makePins, PIN_TABLES } from "./pins.ts";

// Slice 4's 4d (docs/plans/slice-4.md §7): a room's pins, kept in the server's database, not in Ergo's channel
// metadata, which Ergo keeps for registered channels alone (irc/channel.go:191-201 and 279-288, v2.19.1) and the
// server's rooms are not registered. A pin is the line as Ergo held it when it was pinned, never what the page said.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const MOD = "g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw";
const T0 = Date.parse("2026-10-27T09:00:00.000Z");
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

// Ergo's lines, by room and msgid (a line it holds none of is "gone"); what the pins asked of Ergo; `answer` replaces
// Ergo's answers where a test holds one back.
interface Setup {
  max?: number;
  lines?: Record<string, Said | Fetched>;
  answer?: (room: string, msgid: string) => Promise<Fetched>;
}
function setup({ max = PINS_MAX, lines = {}, answer }: Setup = {}) {
  const db = openDatabase(":memory:", [PIN_TABLES]);
  opened.push(db);
  const asked: [string, string][] = [];
  let now = T0;
  const pins = makePins({
    db,
    fetch: (room, msgid) => {
      asked.push([room, msgid]);
      return answer?.(room, msgid) ?? Promise.resolve(lines[`${room} ${msgid}`] ?? "gone");
    },
    now: () => now,
    max,
  });
  return { db, pins, asked, tick: (ms: number) => (now += ms) };
}
const said = (msgid: string, over: Partial<Said> = {}, room = "#bubble/games"): [string, Said] => [
  `${room} ${msgid}`,
  { room, account: ALICE, msgid, text: `text of ${msgid}`, time: T(Number(/\d+/.exec(msgid)?.[0] ?? 0)), ...over },
];
const LINES = Object.fromEntries([said("m1"), said("m2"), said("m3"), said("o1", {}, "#bubble")]);

describe("a room's pins", () => {
  it("pins the line Ergo holds, its id, time, author and text, and lists the newest pinned first", async () => {
    const { pins, tick } = setup({ lines: LINES });
    expect(await pins.add("#bubble/games", "m1", MOD)).toBe("pinned");
    tick(1000);
    expect(await pins.add("#bubble/games", "m3", MOD)).toBe("pinned");
    expect(pins.list("#bubble/games")).toEqual([
      { id: "m3", time: T(3), account: ALICE, text: "text of m3" },
      { id: "m1", time: T(1), account: ALICE, text: "text of m1" },
    ]);
  });

  it("keeps each room's pins apart", async () => {
    const { pins } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    await pins.add("#bubble", "o1", MOD);
    expect(pins.list("#bubble").map(({ id }) => id)).toEqual(["o1"]);
    expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m1"]);
    expect(pins.list("#bubble/news")).toEqual([]);
  });

  it("pins a line once: again it says so, keeps its place and asks Ergo nothing more", async () => {
    const { pins, asked, tick } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    tick(1000);
    await pins.add("#bubble/games", "m2", MOD);
    expect(await pins.add("#bubble/games", "m1", MOD)).toBe("already");
    expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m2", "m1"]);
    expect(asked.filter(([, id]) => id === "m1")).toHaveLength(1);
  });

  it("pins nothing Ergo does not hold: a line gone, hidden or never said", async () => {
    const { pins } = setup({ lines: LINES });
    expect(await pins.add("#bubble/games", "gone", MOD)).toBe("not_found");
    expect(pins.list("#bubble/games")).toEqual([]);
  });

  // Ergo not answering is not Ergo saying the line is gone: a moderator in a blip is told to try again (4d's R7).
  it("says it could not ask, not that the line is gone, when Ergo did not answer", async () => {
    const { pins } = setup({ lines: { "#bubble/games m1": "unanswered" } });
    expect(await pins.add("#bubble/games", "m1", MOD)).toBe("unavailable");
    expect(pins.list("#bubble/games")).toEqual([]);
  });

  // The link's answer is checked, not trusted: another room's line, another line, or one with no time is no pin.
  it.each([
    ["another room's line", said("m1", { room: "#bubble" })[1], "not_found"],
    ["another line than the one asked", said("m2")[1], "not_found"],
    ["a line with no time", { room: "#bubble/games", account: ALICE, msgid: "m1", text: "x" }, "refused"],
    ["a CTCP, an /me among them", said("m1", { text: "\u0001ACTION waves\u0001" })[1], "refused"],
    ["a line of no text", said("m1", { text: "" })[1], "refused"],
    ["a line of over 510 characters", said("m1", { text: "x".repeat(511) })[1], "refused"],
    ["a line of an author that is no address", said("m1", { account: "alice" })[1], "refused"],
  ] as const)("pins nothing from %s", async (_, line, answer) => {
    const { pins } = setup({ lines: { "#bubble/games m1": line } });
    expect(await pins.add("#bubble/games", "m1", MOD)).toBe(answer);
    expect(pins.list("#bubble/games")).toEqual([]);
  });

  // A moderator may pin the correcting line of an edit: it is a line of its own, which the author may edit again.
  it("pins the correcting line of an edit, as any line", async () => {
    const { pins } = setup({ lines: { "#bubble/games m2": said("m2", { edits: "m1" })[1] } });
    expect(await pins.add("#bubble/games", "m2", MOD)).toBe("pinned");
  });

  // What goes through SQLite is any text of a line: quotes, an emoji of four bytes, the longest line in multibyte text.
  it("keeps a line's text as Ergo said it, quotes, emoji and a long multibyte line included", async () => {
    const texts = ['it\'s "quoted"; DROP TABLE pins; -- 😀 \\ é', "é".repeat(255), "😀".repeat(127)];
    const lines = Object.fromEntries(texts.map((text, n) => said(`m${String(n)}`, { text })));
    const { pins, db } = setup({ lines });
    for (const n of texts.keys()) expect(await pins.add("#bubble/games", `m${String(n)}`, MOD)).toBe("pinned");
    expect(pins.list("#bubble/games").map(({ text }) => text)).toEqual(texts.toReversed());
    expect(db.prepare("SELECT count(*) AS n FROM pins").get()).toEqual({ n: 3 });
  });

  it(`holds ${String(PINS_MAX)} pins a room at most, and still says "already" to one it holds`, async () => {
    const lines = Object.fromEntries([
      ...Array.from({ length: PINS_MAX + 1 }, (_, n) => said(`m${String(n)}`)),
      said("o1", {}, "#bubble"),
    ]);
    const { pins } = setup({ lines });
    for (let n = 0; n < PINS_MAX; n += 1) expect(await pins.add("#bubble/games", `m${String(n)}`, MOD)).toBe("pinned");
    expect(await pins.add("#bubble/games", `m${String(PINS_MAX)}`, MOD)).toBe("full");
    expect(await pins.add("#bubble/games", "m0", MOD)).toBe("already");
    expect(pins.list("#bubble/games")).toHaveLength(PINS_MAX);
    // Another room has its own ten.
    expect(await pins.add("#bubble", "o1", MOD)).toBe("pinned");
  });

  // Two moderators pinning at once: each waits on Ergo, so the room's count is read after the wait, not before.
  it("never holds more than its cap when pins are asked at once, or the same line twice", async () => {
    const lines = Object.fromEntries(["m1", "m2", "m3"].map((id) => said(id)));
    const { pins, db } = setup({ max: 2, lines });
    const results = await Promise.all([
      pins.add("#bubble/games", "m1", MOD),
      pins.add("#bubble/games", "m2", MOD),
      pins.add("#bubble/games", "m3", MOD),
      pins.add("#bubble/games", "m1", MOD),
    ]);
    expect(results.filter((each) => each === "pinned")).toHaveLength(2);
    expect(results.filter((each) => each === "full")).toHaveLength(1);
    expect(db.prepare("SELECT count(*) AS n FROM pins").get()).toEqual({ n: 2 });
  });

  it("unpins a line, says whether it held it, and frees its place", async () => {
    const lines = Object.fromEntries(["m1", "m2", "m3"].map((id) => said(id)));
    const { pins } = setup({ max: 2, lines });
    await pins.add("#bubble/games", "m1", MOD);
    await pins.add("#bubble/games", "m2", MOD);
    expect(await pins.add("#bubble/games", "m3", MOD)).toBe("full");
    expect(pins.remove("#bubble/games", "m1")).toBe(true);
    expect(pins.remove("#bubble/games", "m1")).toBe(false);
    expect(pins.remove("#bubble", "m2")).toBe(false);
    expect(await pins.add("#bubble/games", "m3", MOD)).toBe("pinned");
    expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m3", "m2"]);
  });

  // A line deleted by its author (Ergo's REDACT) or hidden by the bot must not stay readable in a room's pins.
  it("drops a line gone from Ergo, and nothing else, and asks nothing of a line it never held", async () => {
    const { pins } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    await pins.add("#bubble/games", "m2", MOD);
    pins.drop("#bubble", "m1");
    pins.drop("#bubble/games", "unknown");
    expect(pins.list("#bubble/games")).toHaveLength(2);
    pins.drop("#bubble/games", "m1");
    expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m2"]);
  });

  it("keeps who pinned a line and when, which no listing shows", async () => {
    const { pins, db } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    expect(db.prepare("SELECT pinned_by, pinned_at FROM pins").get()).toEqual({ pinned_by: MOD, pinned_at: T0 });
  });
});

// A pin ends with its line (docs/decisions.md, 2026-10-27).
describe("a pin and its line leaving the room", () => {
  // The line is asked of Ergo, a REDACT of it comes while the answer is awaited, and the answer still holds it: it must
  // not be pinned after it was deleted (4d's R3).
  it("never pins a line deleted while Ergo was being asked, whichever the answer", async () => {
    const release: (() => void)[] = [];
    const { pins } = setup({
      lines: LINES,
      answer: (room, msgid) =>
        new Promise((resolve) => {
          release.push(() => {
            resolve(LINES[`${room} ${msgid}`] ?? "gone");
          });
        }),
    });
    const adding = pins.add("#bubble/games", "m1", MOD);
    const other = pins.add("#bubble/games", "m2", MOD);
    pins.drop("#bubble/games", "m1");
    for (const go of release) go();
    expect(await adding).toBe("not_found");
    expect(await other).toBe("pinned");
    expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m2"]);
  });

  // Nothing is held against a line after its drop: no mark outlives the pins being added.
  it("leaves no mark behind a drop: the line, if Ergo holds it again, may be pinned", async () => {
    const { pins } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    pins.drop("#bubble/games", "m1");
    expect(await pins.add("#bubble/games", "m1", MOD)).toBe("pinned");
  });

  it("drops a pin whose line was replaced by its author's edit, and keeps it for another account's", async () => {
    const { pins } = setup({ lines: LINES });
    await pins.add("#bubble/games", "m1", MOD);
    pins.edited("#bubble/games", "m1", MOD);
    pins.edited("#bubble", "m1", ALICE);
    expect(pins.list("#bubble/games")).toHaveLength(1);
    pins.edited("#bubble/games", "m1", ALICE);
    expect(pins.list("#bubble/games")).toEqual([]);
  });

  // A delete heard while the link was down is seen only by asking Ergo again, at the link's ready (R5).
  describe("checking each pin again", () => {
    it("drops the pins Ergo says it holds no more, and keeps the others", async () => {
      const gone = new Set<string>();
      const { pins, asked } = setup({
        lines: LINES,
        answer: (room, msgid) =>
          Promise.resolve(gone.has(`${room} ${msgid}`) ? "gone" : (LINES[`${room} ${msgid}`] ?? "gone")),
      });
      for (const id of ["m1", "m2", "m3"]) await pins.add("#bubble/games", id, MOD);
      await pins.add("#bubble", "o1", MOD);
      gone.add("#bubble/games m2");
      gone.add("#bubble o1");
      asked.length = 0;
      await pins.check("#bubble/games");
      expect(asked).toEqual([
        ["#bubble/games", "m1"],
        ["#bubble/games", "m2"],
        ["#bubble/games", "m3"],
      ]);
      expect(pins.list("#bubble/games").map(({ id }) => id)).toEqual(["m3", "m1"]);
      // Another room's pins are its own: asked when the link is in that room.
      expect(pins.list("#bubble").map(({ id }) => id)).toEqual(["o1"]);
      await pins.check("#bubble");
      expect(pins.list("#bubble")).toEqual([]);
    });

    it("keeps every pin whose line Ergo could not be asked about", async () => {
      const state = { answer: "held" as "held" | "unanswered" | "gone" };
      const { pins } = setup({
        lines: LINES,
        answer: (room, msgid) =>
          Promise.resolve(state.answer === "held" ? (LINES[`${room} ${msgid}`] ?? "gone") : state.answer),
      });
      await pins.add("#bubble/games", "m1", MOD);
      state.answer = "unanswered";
      await pins.check("#bubble/games");
      expect(pins.list("#bubble/games")).toHaveLength(1);
      state.answer = "gone";
      await pins.check("#bubble/games");
      expect(pins.list("#bubble/games")).toEqual([]);
    });

    it("asks nothing when no room holds a pin", async () => {
      const { pins, asked } = setup({ lines: LINES });
      await pins.check("#bubble/games");
      expect(asked).toEqual([]);
    });
  });
});
