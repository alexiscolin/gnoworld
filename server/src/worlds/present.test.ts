import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PRESENCE_ANSWER_MAX, Presence, PresencePeople } from "@gnoworld/schemas/indexer";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePresence } from "./presence.ts";
import { PRESENT_MS, countriesTo, startPresent } from "./present.ts";
import { besideOf } from "../replaceFile.ts";

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
  watching?: () => { guests: number; accounts: ReadonlySet<string> };
  inWorlds?: () => ReadonlyMap<string, { guests: number; accounts: ReadonlySet<string> }>;
}

function setup({
  file = fileOf(),
  rates = {},
  rooms = ROOMS,
  hidden = new Set(["#earth/desk", "#govdao/desk"]),
  watching,
  inWorlds,
}: Setup = {}) {
  const logged: [string, unknown][] = [];
  const listed = vi.fn(() => rooms);
  const present = startPresent({
    file,
    now: () => Date.now(),
    ...(watching === undefined ? {} : { watching }),
    ...(inWorlds === undefined ? {} : { inWorlds }),
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

  it("counts the people of one room, by nick, the bot left out, none for a room unread or read too long ago (D394)", () => {
    const { present } = setup();
    present.seen("#earth/kyoto", ["GnoWorld", "ada", "Ada", "bo"]);
    expect([present.here("#earth/kyoto"), present.here("#earth/none")]).toEqual([2, undefined]);
    vi.setSystemTime(T0 + 4 * MINUTE);
    expect(present.here("#earth/kyoto")).toBeUndefined();
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

  it("counts every open stream, a guest's too, and falls as they close (D352)", async () => {
    let site = { guests: 0, accounts: new Set<string>() };
    const { present } = setup({ watching: () => site });
    present.seen("#earth", ["ada"]);
    site = { guests: 3, accounts: new Set() };
    vi.advanceTimersByTime(MINUTE);
    expect(await counts(present)).toEqual({ online: 4, countries: 0 });
    site = { guests: 0, accounts: new Set() };
    vi.advanceTimersByTime(MINUTE);
    expect(await counts(present)).toEqual({ online: 1, countries: 0 });
  });

  it("counts a logged-in person once, by account, whether the relay holds them, the stream does or both", async () => {
    const { present } = setup({ watching: () => ({ guests: 1, accounts: new Set(["ada", "bo"]) }) });
    present.seen("#earth", ["Ada", "cy"]);
    present.declared("bo", "FR", false);
    present.declared("ada", "FR", false);
    expect(await counts(present)).toEqual({ online: 4, countries: 1 });
  });

  it("leaves the guests out of a world's trends and history (D353), whatever the figure served counts (D374)", async () => {
    const guest = { guests: 50, accounts: new Set(["ada"]) };
    const { present, hereIn, file } = setup({
      watching: () => guest,
      inWorlds: () => new Map([["earth", guest]]),
    });
    vi.advanceTimersByTime(PRESENT_MS - MINUTE);
    present.seen("#earth", ["bo"]);
    // Served: bo, ada and the 50 guests; the trend and the history: bo alone.
    expect(await hereIn("earth")).toBe(52);
    expect(present.chat().find((each) => each.world === "earth")?.here.now).toBe(1);
    vi.advanceTimersByTime(MINUTE);
    // The file this presence wrote: its sample holds bo alone, never the 50 guests (the batch's review: a new file read nothing).
    expect(makePresence({ file, now: () => T0 + PRESENT_MS }).history("earth")).toEqual([{ at: T0, people: 1 }]);
  });

  it("serves a world's here as its accounts once plus its guests, each world on its own (D374)", async () => {
    const { present, worlds } = setup({
      inWorlds: () =>
        new Map([
          ["earth", { guests: 2, accounts: new Set(["ada", "dee"]) }],
          ["bubble", { guests: 2, accounts: new Set<string>() }],
        ]),
    });
    // ada is in the relay and has a stream: once; dee has a stream alone: counted; bo is in the relay alone.
    present.seen("#earth", ["Ada", "bo"]);
    expect(await worlds()).toEqual([
      { world: "bubble", here: 2, perHour: 0, rise: null },
      { world: "earth", here: 5, perHour: 0, rise: null },
    ]);
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

// Moved here from presence.test.ts: a test sits beside the file it tests.
describe("guests and who is here (D430)", () => {
  // A guest's relayed line counts in the plate's messages an hour and never in a trend or a history (D353, D374), and no
  // anon/ nick is ever an account here (D430). Read in server/src/activity and worlds/present.ts: one `rates` feeds the plate,
  // the trend and the history alike, so the guests' own rates are a second source the plate adds and the others do not.
  const MINUTE = 60_000;
  const T0 = Date.parse("2026-11-03T12:00:00.000Z");
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-guest-present-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  let made = 0;
  const running: { stop: () => void }[] = [];
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    for (const one of running.splice(0)) one.stop();
    vi.useRealTimers();
  });

  interface Setup {
    rates?: Record<string, number>;
    guests?: Record<string, number>;
    rooms?: readonly { name: string; world: string }[];
    open?: { guests: number; accounts: readonly string[] };
    watching?: { guests: number; accounts: readonly string[] };
    spy?: (rooms: readonly string[]) => void;
  }

  const setup = ({ rates = {}, guests = {}, rooms, open, watching, spy }: Setup = {}) => {
    made += 1;
    const file = join(dir, `presence-${String(made)}.json`);
    const present = startPresent({
      file,
      now: () => Date.now(),
      open: () => true,
      rooms: () => rooms ?? [{ name: "#earth", world: "earth" }],
      rates: (asked: readonly string[]) => {
        spy?.(asked);
        return new Map(asked.map((room) => [room, rates[room] ?? 0]));
      },
      guestRates: (asked: readonly string[]) => new Map(asked.map((room) => [room, guests[room] ?? 0])),
      ...(watching === undefined ? {} : { watching: () => watching }),
      ...(open === undefined ? {} : { inWorlds: () => new Map([["earth", open]]) }),
      log: () => undefined,
    });
    running.push(present);
    const worlds = async () => Presence.parse(JSON.parse(await (await present.routes.request("/")).text())).worlds;
    const people = async () => PresencePeople.parse(JSON.parse(await (await present.routes.request("/people")).text()));
    return { present, file, worlds, people };
  };

  describe("a guest in who is here", () => {
    it("counts no anon/ nick as a person, in a room or in a world: a relayed nick is no account's", async () => {
      const { present, worlds } = setup();
      present.seen("#earth", ["gnoworld", "ada", "anon/brave-otter-ab23", "Anon/Calm-Heron-cd34"]);
      expect(present.here("#earth")).toBe(1);
      expect((await worlds()).find(({ world }) => world === "earth")?.here).toBe(1);
    });

    it("counts no anon/ nick in the trends' signal either", () => {
      const { present } = setup();
      present.seen("#earth", ["gnoworld", "ada", "anon/brave-otter-ab23"]);
      expect(present.chat()).toEqual([
        { world: "earth", here: { now: 1, usual: null }, messages: { now: 0, usual: null } },
      ]);
    });
  });

  describe("a guest's lines in a world's messages an hour", () => {
    it("shows them on the plate: its pace is the accounts' and the guests' together", async () => {
      const { present, worlds } = setup({ rates: { "#earth": 1 }, guests: { "#earth": 0.5 } });
      present.seen("#earth", ["gnoworld", "ada"]);
      expect((await worlds()).find(({ world }) => world === "earth")?.perHour).toBe(90);
    });

    it("leaves them out of the trend's messages now: the accounts' pace alone", () => {
      const { present } = setup({ rates: { "#earth": 1 }, guests: { "#earth": 0.5 } });
      present.seen("#earth", ["gnoworld", "ada"]);
      expect(present.chat()[0]?.messages).toEqual({ now: 60, usual: null });
    });

    it("leaves them out of the messages' history the trend's usual is made of", () => {
      const { present, file } = setup({ rates: { "#earth": 1 }, guests: { "#earth": 0.5 } });
      vi.advanceTimersByTime(PRESENT_MS - MINUTE);
      present.seen("#earth", ["gnoworld", "ada"]);
      vi.advanceTimersByTime(MINUTE);
      const read = makePresence({ file: besideOf(file, "messages"), now: () => T0 + PRESENT_MS });
      expect(read.history("earth")).toEqual([{ at: T0, people: 60 }]);
    });

    it("still shows a world only guests talk in: its plate has the count, its trend none", async () => {
      const { present, worlds } = setup({ guests: { "#earth": 0.5 } });
      present.seen("#earth", ["gnoworld"]);
      expect((await worlds()).find(({ world }) => world === "earth")?.perHour).toBe(30);
      expect(present.chat()[0]?.messages).toEqual({ now: 0, usual: null });
    });

    it("changes nothing when no guest speaks", async () => {
      const { present, worlds } = setup({ rates: { "#earth": 1 } });
      present.seen("#earth", ["gnoworld", "ada"]);
      expect((await worlds()).find(({ world }) => world === "earth")?.perHour).toBe(60);
    });
  });

  describe("a reading guest's own Ergo nick is no account's (M4)", () => {
    it("counts no Guest-<nick> as a person: a world's here is its accounts and its guest streams, once each", async () => {
      const { present, worlds } = setup({ open: { guests: 1, accounts: [] } });
      present.seen("#earth", ["gnoworld", "Guest-x", "guest-y"]);
      expect(present.here("#earth")).toBe(0);
      expect((await worlds()).find(({ world }) => world === "earth")?.here).toBe(1);
    });

    it("counts none in the trend or the history: a room with reading guests alone has 0 here, now and in the hour's record", () => {
      const { present, file } = setup({ open: { guests: 1, accounts: [] } });
      present.seen("#earth", ["gnoworld", "Guest-x", "GUEST-z"]);
      expect(present.chat()[0]?.here).toEqual({ now: 0, usual: null });
      vi.advanceTimersByTime(PRESENT_MS - MINUTE);
      present.seen("#earth", ["gnoworld", "Guest-x", "GUEST-z"]);
      vi.advanceTimersByTime(MINUTE);
      const read = makePresence({ file, now: () => T0 + PRESENT_MS });
      // The history keeps no sample of an empty world: a reading guest left no person in it.
      expect(read.history("earth").filter(({ people }) => people > 0)).toEqual([]);
    });

    it("counts a reading guest once in the site's online total, by its stream alone", async () => {
      const { present, people } = setup({ watching: { guests: 1, accounts: [] } });
      present.seen("#earth", ["gnoworld", "Guest-x", "ada"]);
      expect((await people()).online).toBe(2);
    });

    it("still counts an account whose name only starts like the word: guesting, guestbook", () => {
      const { present } = setup();
      present.seen("#earth", ["gnoworld", "guesting", "guestbook", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"]);
      expect(present.here("#earth")).toBe(3);
    });
  });

  describe("the answer is built from each world once (L6)", () => {
    it("builds 20,000 rooms of one world in a few milliseconds, a world's room list never copied for each room", () => {
      // The clock is the real one here: fake timers fake performance.now too.
      vi.useRealTimers();
      const rooms = Array.from({ length: 20_000 }, (_, n) => ({ name: `#earth/room-${String(n)}`, world: "earth" }));
      // Copied for each room, 20,000 rooms cost about 110 ms here; pushed, under 5. The best of five fresh answers (one is kept a
      // minute), so a loaded machine's one slow run is not read as a copy (the gate's lanes took one to 230 ms); a copy is slow on each.
      const runs = Array.from({ length: 5 }, () => {
        const { present } = setup({ rooms });
        present.seen("#earth/room-1", ["gnoworld", "ada"]);
        const started = performance.now();
        present.current();
        return performance.now() - started;
      });
      expect(Math.min(...runs)).toBeLessThan(40);
    });

    it("asks the rates of a world's rooms once in an answer: the plate and the trend share one read", () => {
      const asked: (readonly string[])[] = [];
      const { present } = setup({
        rooms: [
          { name: "#earth", world: "earth" },
          { name: "#bubble", world: "bubble" },
        ],
        spy: (rooms) => asked.push(rooms),
      });
      present.seen("#earth", ["gnoworld", "ada"]);
      asked.length = 0;
      vi.advanceTimersByTime(61_000);
      present.current();
      expect(asked).toHaveLength(2);
    });
  });
});
