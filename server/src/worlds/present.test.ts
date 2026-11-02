import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Presence, PRESENCE_ANSWER_MAX } from "@gnoworld/schemas/indexer";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePresence } from "./presence.ts";
import { PRESENT_MS, startPresent } from "./present.ts";

// Who is here (slice 7, 7h, the sampler 7c left to the labels): the people the reconciler reads in each room a guest may see, a world's
// counted once across its rooms, the bot left out; recorded into 7c's history, so a world rises against its own 14 days; and served as
// counts alone, never a name, for the cosmos's labels.
const HOUR = 3_600_000;
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-03T12:00:00.000Z");
const dir = mkdtempSync(join(tmpdir(), "gnoworld-present-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let made = 0;
const fileOf = (): string => {
  made += 1;
  const folder = join(dir, `t${String(made)}`);
  mkdirSync(folder);
  return join(folder, "presence.json");
};

const ROOMS = [
  { name: "#earth", world: "earth" },
  { name: "#earth/kyoto", world: "earth" },
  { name: "#earth/desk", world: "earth" },
  { name: "#bubble", world: "bubble" },
  { name: "#govdao/desk", world: "govdao" },
];
const running: { stop: () => void }[] = [];

interface Setup {
  file?: string;
  rates?: Record<string, number>;
  rooms?: readonly { name: string; world: string }[];
  hidden?: Set<string>;
}

function setup({
  file = fileOf(),
  rates = {},
  rooms = ROOMS,
  hidden = new Set(["#earth/desk", "#govdao/desk"]),
}: Setup = {}) {
  const present = startPresent({
    file,
    now: () => Date.now(),
    open: (room) => !hidden.has(room),
    rooms: () => rooms,
    rates: (asked) => new Map(asked.map((room) => [room, rates[room] ?? 0])),
  });
  running.push(present);
  const ask = async () => {
    const response = await present.routes.request("/");
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.text() };
  };
  const worlds = async () => Presence.parse(JSON.parse((await ask()).body)).worlds;
  const hereIn = async (world: string) => (await worlds()).find((each) => each.world === world)?.here;
  return { present, file, ask, worlds, hereIn, hidden };
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  for (const one of running.splice(0)) one.stop();
  vi.useRealTimers();
});

describe("who is here", () => {
  it("counts a world's people once across the rooms a guest sees, the bot left out", async () => {
    const { present, worlds } = setup();
    present.seen("#earth", ["gnoworld", "ada", "bo"]);
    present.seen("#earth/kyoto", ["gnoworld", "ada", "cy"]);
    present.seen("#earth/desk", ["gnoworld", "dee", "eve"]);
    present.seen("#bubble", ["gnoworld"]);
    expect(await worlds()).toEqual([
      { world: "bubble", here: 0, perHour: 0, rise: null },
      { world: "earth", here: 3, perHour: 0, rise: null },
    ]);
  });

  it("knows a person by their nick whatever its case, and the bot too", async () => {
    const { present, hereIn } = setup();
    present.seen("#earth", ["GnoWorld", "Ada", "bo"]);
    present.seen("#earth/kyoto", ["gnoworld", "ada", "BO"]);
    expect(await hereIn("earth")).toBe(2);
  });

  it("says nothing of a world with no room a guest sees, nor of a room the server did not make", async () => {
    const { present, worlds } = setup();
    present.seen("#govdao/desk", ["gnoworld", "ada"]);
    present.seen("#elsewhere", ["gnoworld", "ada"]);
    expect((await worlds()).map(({ world }) => world)).toEqual(["bubble", "earth"]);
  });

  it("stops counting a room the moment a guest may no longer see it", async () => {
    const { present, hereIn, hidden } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    expect(await hereIn("earth")).toBe(2);
    hidden.add("#earth/kyoto");
    expect(await hereIn("earth")).toBe(1);
  });

  it("forgets a room's people once the reconciler has not read it for three minutes, and not before", async () => {
    const { present, hereIn } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    vi.setSystemTime(T0 + 2 * MINUTE);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    vi.setSystemTime(T0 + 3 * MINUTE - 1);
    expect(await hereIn("earth")).toBe(2);
    vi.setSystemTime(T0 + 3 * MINUTE + 1);
    expect(await hereIn("earth")).toBe(1);
  });

  it("gives each world's messages an hour from its open rooms' pace now", async () => {
    const { hereIn, worlds } = setup({ rates: { "#earth": 1.5, "#earth/kyoto": 0.5, "#earth/desk": 9 } });
    expect(await hereIn("earth")).toBe(0);
    expect((await worlds()).find(({ world }) => world === "earth")?.perHour).toBe(120);
  });

  it("lets a small world rise against its own 14 days, and a world with no history none", async () => {
    const file = fileOf();
    const clock = { at: T0 - 48 * HOUR };
    const past = makePresence({ file, now: () => clock.at });
    for (let hour = 0; hour < 48; hour += 1, clock.at += HOUR) past.record(new Map([["bubble", 1]]));
    expect(past.save()).toBe(true);
    const { present, worlds } = setup({ file });
    present.seen("#bubble", ["gnoworld", "a", "b", "c", "d", "e", "f"]);
    present.seen("#earth", ["gnoworld", "a", "b", "c", "d", "e", "f"]);
    expect(await worlds()).toEqual([
      { world: "bubble", here: 6, perHour: 0, rise: 5 },
      { world: "earth", here: 6, perHour: 0, rise: null },
    ]);
  });

  it("answers counts alone, no name of anyone, public and kept a minute by any cache", async () => {
    const { present, ask } = setup();
    present.seen("#earth", ["gnoworld", "ada-lovelace"]);
    const { status, cache, body } = await ask();
    expect(status).toBe(200);
    expect(cache).toBe("public, max-age=60");
    expect(body).not.toContain("ada");
    expect(body).not.toContain("gnoworld");
  });

  it(`answers ${String(PRESENCE_ANSWER_MAX)} worlds at most, the first by name, so a client's schema still reads it`, async () => {
    const many = Array.from({ length: PRESENCE_ANSWER_MAX + 3 }, (_, index) => ({
      name: `#w${String(index).padStart(4, "0")}`,
      world: `w${String(index).padStart(4, "0")}`,
    }));
    const listed = await setup({ rooms: many, hidden: new Set() }).worlds();
    expect(listed).toHaveLength(PRESENCE_ANSWER_MAX);
    expect(listed.at(-1)?.world).toBe(`w${String(PRESENCE_ANSWER_MAX - 1).padStart(4, "0")}`);
  });
});

describe("the history it keeps", () => {
  it(`records each world's people every ${String(PRESENT_MS / MINUTE)} minutes into its file, the busiest of each hour`, () => {
    const { present, file } = setup();
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#earth", ["gnoworld", "ada", "bo"]);
    vi.advanceTimersByTime(MINUTE);
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#earth", ["gnoworld", "ada"]);
    vi.advanceTimersByTime(MINUTE);
    const read = makePresence({ file, now: () => T0 + 2 * PRESENT_MS });
    expect(read.history("earth")).toEqual([{ at: T0, people: 2 }]);
  });

  it("records once more as it stops, leaves no timer, and a second stop writes nothing", () => {
    const { present, file } = setup();
    present.seen("#bubble", ["gnoworld", "a", "b", "c", "d"]);
    present.stop();
    expect(makePresence({ file, now: () => T0 }).history("bubble")).toEqual([{ at: T0, people: 4 }]);
    expect(vi.getTimerCount()).toBe(0);
    const written = statSync(file).mtimeMs;
    vi.setSystemTime(T0 + MINUTE);
    present.seen("#bubble", ["gnoworld", "a"]);
    present.stop();
    expect(statSync(file).mtimeMs).toBe(written);
  });

  it("starts empty on a file that is no history, and serves", async () => {
    const file = fileOf();
    writeFileSync(file, "{not json");
    const { present, hereIn } = setup({ file });
    present.seen("#bubble", ["gnoworld", "a"]);
    expect(await hereIn("bubble")).toBe(1);
  });

  it("goes on when its folder refuses the file: the timer and the stop throw nothing, the counts still served", async () => {
    const file = join(fileOf(), "inside-a-file", "presence.json");
    writeFileSync(join(file, "..", ".."), "a file where a folder should be");
    const { present, hereIn } = setup({ file });
    present.seen("#bubble", ["gnoworld", "a", "b"]);
    expect(await hereIn("bubble")).toBe(2);
    expect(() => vi.advanceTimersByTime(PRESENT_MS)).not.toThrow();
    expect(() => {
      present.stop();
    }).not.toThrow();
    expect(readFileSync(join(file, "..", ".."), "utf8")).toBe("a file where a folder should be");
  });
});
