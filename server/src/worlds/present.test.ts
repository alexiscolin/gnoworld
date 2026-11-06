import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Presence, PRESENCE_ANSWER_MAX, PresencePeople } from "@gnoworld/schemas/indexer";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePresence } from "./presence.ts";
import { countriesTo, PRESENT_MS, startPresent } from "./present.ts";

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
  const logged: [string, unknown][] = [];
  const listed = vi.fn(() => rooms);
  const present = startPresent({
    file,
    now: () => Date.now(),
    open: (room) => !hidden.has(room),
    rooms: listed,
    rates: (asked) => new Map(asked.map((room) => [room, rates[room] ?? 0])),
    log: (event, fields) => logged.push([event, fields]),
  });
  running.push(present);
  const ask = async () => {
    const response = await present.routes.request("/");
    return { status: response.status, cache: response.headers.get("cache-control"), body: await response.text() };
  };
  const worlds = async () => Presence.parse(JSON.parse((await ask()).body)).worlds;
  const hereIn = async (world: string) => (await worlds()).find((each) => each.world === world)?.here;
  return { present, file, ask, worlds, hereIn, hidden, listed, logged };
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

  it("stops counting a room a guest may no longer see once the answer it keeps a minute is redone", async () => {
    const { present, hereIn, hidden } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    expect(await hereIn("earth")).toBe(2);
    hidden.add("#earth/kyoto");
    vi.setSystemTime(T0 + MINUTE);
    present.seen("#earth", ["gnoworld", "ada"]);
    expect(await hereIn("earth")).toBe(1);
  });

  it("keeps its answer while nothing changes, a minute at most, so asking it often costs no build", async () => {
    const { present, ask, listed } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    const first = (await ask()).body;
    const calls = listed.mock.calls.length;
    vi.setSystemTime(T0 + MINUTE - 1);
    expect((await ask()).body).toBe(first);
    expect(listed.mock.calls.length).toBe(calls);
    vi.setSystemTime(T0 + MINUTE);
    await ask();
    expect(listed.mock.calls.length).toBeGreaterThan(calls);
  });

  it("builds a changed answer again a second after its last build, never sooner", async () => {
    const { present, ask, listed } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    const first = (await ask()).body;
    const calls = listed.mock.calls.length;
    present.seen("#earth", ["gnoworld", "ada", "bo"]);
    vi.setSystemTime(T0 + 999);
    expect((await ask()).body).toBe(first);
    expect(listed.mock.calls.length).toBe(calls);
    vi.setSystemTime(T0 + 1000);
    expect((await ask()).body).not.toBe(first);
  });

  it("forgets a room's people once the reconciler has not read it for three minutes, and not before", async () => {
    const { present, hereIn } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    vi.setSystemTime(T0 + 2 * MINUTE);
    present.seen("#earth/kyoto", ["gnoworld", "bo"]);
    vi.setSystemTime(T0 + 3 * MINUTE);
    expect(await hereIn("earth")).toBe(2);
    vi.setSystemTime(T0 + 4 * MINUTE + 1);
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

  it("hands the server's own readers the counts it serves, the ticker's trends among them (7t)", async () => {
    const { present, ask } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    const held = present.current();
    expect(held).toEqual(Presence.parse(JSON.parse((await ask()).body)));
    expect(held.worlds.find(({ world }) => world === "earth")?.here).toBe(1);
    present.seen("#bubble", ["gnoworld", "bo"]);
    vi.advanceTimersByTime(1000);
    expect(present.current().worlds.find(({ world }) => world === "bubble")?.here).toBe(1);
  });

  it("builds what it hands out under the answer's own rule: once a minute, or a second after a change, however often it is asked", () => {
    const { present, listed } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.current();
    const built = listed.mock.calls.length;
    for (let ask = 0; ask < 50; ask += 1) present.current();
    expect(listed.mock.calls.length).toBe(built);
    present.seen("#bubble", ["gnoworld", "bo"]);
    expect(present.current().worlds.find(({ world }) => world === "bubble")?.here).toBe(0);
    vi.advanceTimersByTime(999);
    expect(present.current().worlds.find(({ world }) => world === "bubble")?.here).toBe(0);
    vi.advanceTimersByTime(1);
    expect(present.current().worlds.find(({ world }) => world === "bubble")?.here).toBe(1);
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

// 7t3's score reads each world's people here and messages an hour against its own 14 days: the messages' history is kept as the people's is,
// the busiest sample of each hour, in a file beside it; a world whose rooms went unread gives no signal, never a zero.
describe("the chat's signals for the trends", () => {
  const messagesOf = (file: string) => join(dirname(file), "presence-messages.json");
  const pastOf = (file: string, world: string, count: number) => {
    const clock = { at: T0 - 48 * HOUR };
    const past = makePresence({ file, now: () => clock.at });
    for (let hour = 0; hour < 48; hour += 1, clock.at += HOUR) past.record(new Map([[world, count]]));
    expect(past.save()).toBe(true);
  };

  it("hands each world's people here and messages an hour, each beside its usual hour of the last 14 days", () => {
    const file = fileOf();
    pastOf(file, "bubble", 4);
    pastOf(messagesOf(file), "bubble", 100);
    const { present } = setup({ file, rates: { "#bubble": 5 } });
    present.seen("#bubble", ["gnoworld", "a", "b", "c", "d", "e", "f"]);
    present.seen("#earth", ["gnoworld", "a"]);
    expect(present.chat()).toEqual([
      { world: "bubble", here: { now: 6, usual: 4 }, messages: { now: 300, usual: 100 } },
      { world: "earth", here: { now: 1, usual: null }, messages: { now: 0, usual: null } },
    ]);
  });

  it("gives no signal of a world whose rooms went unread: unknown, never zero", () => {
    const { present } = setup({ rates: { "#earth": 2 } });
    present.seen("#bubble", ["gnoworld", "a"]);
    expect(present.chat().map(({ world }) => world)).toEqual(["bubble"]);
  });

  it(`records each world's messages an hour every ${String(PRESENT_MS / MINUTE)} minutes beside its people, the busiest of each hour, none for a room unread`, () => {
    const { present, file } = setup({ rates: { "#earth": 1.5, "#earth/kyoto": 0.5, "#bubble": 3 } });
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#earth", ["gnoworld", "ada"]);
    vi.advanceTimersByTime(MINUTE);
    const read = makePresence({ file: messagesOf(file), now: () => T0 + PRESENT_MS });
    expect(read.history("earth")).toEqual([{ at: T0, people: 120 }]);
    expect(read.history("bubble")).toEqual([]);
  });

  it("counts no room a guest cannot see, in the signals as in the messages' history", () => {
    const { present, file } = setup({ rates: { "#earth": 2, "#earth/desk": 5, "#govdao/desk": 5 } });
    present.seen("#earth", ["gnoworld", "ada"]);
    present.seen("#earth/desk", ["gnoworld", ...Array.from({ length: 20 }, (_, at) => `p${String(at)}`)]);
    present.seen("#govdao/desk", ["gnoworld", ...Array.from({ length: 20 }, (_, at) => `q${String(at)}`)]);
    expect(present.chat()).toEqual([
      { world: "earth", here: { now: 1, usual: null }, messages: { now: 120, usual: null } },
    ]);
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#earth", ["gnoworld", "ada"]);
    vi.advanceTimersByTime(MINUTE);
    const read = makePresence({ file: messagesOf(file), now: () => T0 + PRESENT_MS });
    expect(read.history("earth")).toEqual([{ at: T0, people: 120 }]);
    expect(read.history("govdao")).toEqual([]);
  });

  it("says when its folder refuses the messages' history, and still records the people's", () => {
    const file = fileOf();
    mkdirSync(messagesOf(file));
    const { present, logged } = setup({ file });
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#bubble", ["gnoworld", "a"]);
    vi.advanceTimersByTime(MINUTE);
    expect(logged).toContainEqual(["alert", { error: "presence_write" }]);
    expect(makePresence({ file, now: () => T0 + PRESENT_MS }).history("bubble")).toEqual([{ at: T0, people: 1 }]);
  });

  it("builds the signals with the answer, once a minute or a second after a change, however often they are asked", () => {
    const { present, listed } = setup();
    present.seen("#earth", ["gnoworld", "ada"]);
    present.chat();
    const built = listed.mock.calls.length;
    for (let ask = 0; ask < 50; ask += 1) {
      present.chat();
      present.current();
    }
    expect(listed.mock.calls.length).toBe(built);
  });
});

describe("the history it keeps", () => {
  it("keeps no hour for a world whose rooms went unread, so a return from an outage is no rise", async () => {
    const file = fileOf();
    const clock = { at: T0 - 48 * HOUR };
    const past = makePresence({ file, now: () => clock.at });
    for (let hour = 0; hour < 48; hour += 1, clock.at += HOUR) past.record(new Map([["bubble", 10]]));
    expect(past.save()).toBe(true);
    const { present, worlds } = setup({ file });
    vi.advanceTimersByTime(60 * HOUR);
    present.seen("#bubble", ["gnoworld", ...Array.from({ length: 10 }, (_, at) => `p${String(at)}`)]);
    expect((await worlds()).find(({ world }) => world === "bubble")).toEqual({
      world: "bubble",
      here: 10,
      perHour: 0,
      rise: null,
    });
    present.stop();
    const kept = makePresence({ file, now: () => Date.now() }).history("bubble");
    expect(kept.filter(({ people }) => people === 0)).toEqual([]);
  });

  it("reads 10,000 rooms at most, the first it saw: a room past them counts no one", async () => {
    const { present, hereIn } = setup({ rooms: [...ROOMS, { name: "#late", world: "late" }], hidden: new Set() });
    for (let room = 0; room < 10_000; room += 1) present.seen(`#r${String(room)}`, ["gnoworld", "x"]);
    present.seen("#late", ["gnoworld", "ada"]);
    expect(await hereIn("late")).toBe(0);
  });

  it("says when its folder refuses the history, as the other files' writers do", () => {
    const file = join(fileOf(), "inside-a-file", "presence.json");
    writeFileSync(join(file, "..", ".."), "a file where a folder should be");
    const { present, logged } = setup({ file });
    present.seen("#bubble", ["gnoworld", "a"]);
    vi.advanceTimersByTime(PRESENT_MS);
    expect(logged).toContainEqual(["alert", { error: "presence_write" }]);
  });

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

// The home's hero (8i): the people online, each once, and the countries those of them name: two counts, never who.
describe("the people online", () => {
  const peopleOf = async (present: ReturnType<typeof setup>["present"]) => {
    const response = await present.routes.request("/people");
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      body: await response.text(),
    };
  };
  const counts = async (present: ReturnType<typeof setup>["present"]) =>
    PresencePeople.parse(JSON.parse((await peopleOf(present)).body));

  it("counts each nick once across the rooms a guest sees, whatever its case, the bot left out", async () => {
    const { present } = setup();
    present.seen("#earth", ["gnoworld", "Ada", "bo"]);
    present.seen("#earth/kyoto", ["ADA", "cy"]);
    present.seen("#bubble", ["ada", "di"]);
    expect(await counts(present)).toEqual({ online: 4, countries: 0 });
  });

  it("leaves out the rooms a guest cannot see, and the rooms unread for three minutes", async () => {
    const { present } = setup();
    present.seen("#earth/desk", ["secret"]);
    present.seen("#bubble", ["ada"]);
    vi.advanceTimersByTime(2 * MINUTE);
    present.seen("#earth", ["bo"]);
    vi.advanceTimersByTime(MINUTE + 1000);
    expect(await counts(present)).toEqual({ online: 1, countries: 0 });
  });

  it("answers counts alone, public and kept a minute, as the world answer does", async () => {
    const { present } = setup();
    present.seen("#earth", ["ada-lovelace"]);
    present.declared("ada-lovelace", "FR", false);
    const { status, cache, body } = await peopleOf(present);
    expect([status, cache]).toEqual([200, "public, max-age=60"]);
    expect(body).not.toContain("ada");
    expect(body).not.toContain("FR");
  });

  it("answers zero people and zero countries when no room was read", async () => {
    expect(await counts(setup().present)).toEqual({ online: 0, countries: 0 });
  });

  it("counts the countries of the people online alone, each country once", async () => {
    const { present } = setup();
    present.seen("#earth", ["ada", "bo", "cy"]);
    present.declared("Ada", "FR", false);
    present.declared("bo", "FR", false);
    present.declared("gone", "DE", false);
    expect(await counts(present)).toEqual({ online: 3, countries: 1 });
  });

  it("keeps an account's last country, and an older line only for an account not heard yet", async () => {
    const { present } = setup();
    present.seen("#earth", ["ada", "bo", "cy"]);
    present.declared("ada", "FR", false);
    present.declared("ada", "DE", false);
    present.declared("bo", "DE", false);
    present.declared("ada", "US", true);
    present.declared("cy", "JP", true);
    expect(await counts(present)).toEqual({ online: 3, countries: 2 });
  });

  it("evicts the account that spoke longest ago once 100,000 are kept", async () => {
    const { present } = setup();
    present.seen("#earth", ["first", "a1"]);
    present.declared("first", "FR", false);
    for (let at = 1; at < 100_000; at += 1) present.declared(`a${String(at)}`, "US", false);
    expect((await counts(present)).countries).toBe(2);
    present.declared("one-more", "US", false);
    present.seen("#earth", ["first", "a1"]);
    vi.advanceTimersByTime(MINUTE);
    expect((await counts(present)).countries).toBe(1);
  });

  it("declares nothing from a line of a room a guest cannot see, or one with no country", () => {
    const { present } = setup();
    const declared = vi.spyOn(present, "declared");
    const to = countriesTo(present, (room) => room !== "#earth/desk");
    const said = { msgid: "m", text: "hi", account: "ada" };
    to({ ...said, room: "#earth/desk", country: "FR" }, false);
    to({ ...said, room: "#earth" }, false);
    expect(declared).not.toHaveBeenCalled();
    to({ ...said, room: "#earth", country: "FR" }, true);
    expect(declared).toHaveBeenCalledWith("ada", "FR", true);
  });
});
