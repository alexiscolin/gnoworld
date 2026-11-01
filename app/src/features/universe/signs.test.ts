// @vitest-environment jsdom
import { parseLine } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rules from "../../../data/bubbles.json" with { type: "json" };
import { createAppStore } from "../../store/index.ts";
import { Signs, type SignsDeps } from "./signs.ts";

// What the Earth shows, from the store to the page: `pickBubbles` when a line comes and once a second, never on a frame (docs/plans/slice-6.md
// §4). The clock is the page's, faked here; the rules are the file's, so tuning them breaks nothing.
const SHOW = rules.showSeconds * 1000;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ANN = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const LIST: RoomList["sections"] = [
  {
    name: null,
    rooms: [
      { room: "#earth", type: "open" },
      { room: "#earth/help", type: "open" },
      { room: "#earth/lisbon", type: "open" },
      { room: "#earth/kyoto", type: "members" },
    ],
  },
];
const PLACES = [
  { room: "#earth/lisbon", lat: 38.7, lon: -9.1 },
  { room: "#earth/kyoto", lat: 35, lon: 135.8 },
  { room: "#earth/nowhere", lat: 0, lon: 0 },
];

function heard(id: string, over: { from?: string; country?: string; room?: string; text?: string; at?: number } = {}) {
  const { from = ANN, country = "JP", room = "#earth", text = "hello", at = Date.now() } = over;
  const time = new Date(at).toISOString();
  const parsed = parseLine(
    `@msgid=${id};time=${time};account=${from};+gnoworld/country=${country} :${from}!u@h PRIVMSG ${room} :${text}`,
  );
  if (!parsed.ok) throw new Error("the test's line does not parse");
  return parsed.message;
}
const redact = (id: string, room = "#earth") => {
  const parsed = parseLine(`@time=${new Date().toISOString()} :ergo REDACT ${room} ${id}`);
  if (!parsed.ok) throw new Error("the test's line does not parse");
  return parsed.message;
};

function setup(over: Partial<SignsDeps> = {}, list: RoomList["sections"] | undefined = LIST) {
  const store = createAppStore();
  store.getState().chatActions.follow(["#earth", "#earth/help", "#earth/lisbon"]);
  store.getState().chatActions.connected(ME);
  store.getState().chatActions.listed(list);
  const ground = {
    setMarks: vi.fn(),
    facing: vi.fn<() => { lat: number; lon: number } | undefined>(() => ({ lat: 36, lon: 138 })),
    face: vi.fn(),
  };
  const signs = new Signs({ store, ground, rules, places: PLACES, ...over });
  const told = vi.fn();
  signs.subscribe(told);
  return { store, ground, signs, told };
}

async function started(over: Partial<SignsDeps> = {}, list?: RoomList["sections"]) {
  const made = setup(over, list);
  const stop = made.signs.start();
  await vi.advanceTimersByTimeAsync(0);
  return { ...made, stop };
}
const say = (store: ReturnType<typeof createAppStore>, id: string, over?: Parameters<typeof heard>[1]) => {
  store.getState().chatActions.heard(heard(id, over));
};

let left: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  left = [];
});
afterEach(() => {
  for (const stop of left) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("what comes up", () => {
  it("shows a public line at once, not at the next second", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1", { text: "gm from Tokyo" });
    expect(signs.snapshot().bubbles.map(({ text, country }) => [text, country])).toEqual([["gm from Tokyo", "JP"]]);
  });

  it("tells the page once a change, and not a second that changed nothing", async () => {
    const { store, told, stop } = await started();
    left.push(stop);
    say(store, "m1");
    told.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(told).not.toHaveBeenCalled();
  });

  it("keeps the same snapshot while nothing changed: React reads it", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    const one = signs.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot()).toBe(one);
  });

  it("takes a bubble off when its five seconds are over, on the second's tick", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    await vi.advanceTimersByTimeAsync(SHOW - 1000);
    expect(signs.snapshot().bubbles).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("reads a side room's lines as the general chat's", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1", { room: "#earth/help" });
    expect(signs.snapshot().bubbles).toHaveLength(1);
  });

  it("shows nothing before the list of rooms says what is public", () => {
    const store = createAppStore();
    store.getState().chatActions.follow(["#earth"]);
    store.getState().chatActions.connected(ME);
    const ground = { setMarks: vi.fn(), facing: vi.fn(() => ({ lat: 36, lon: 138 })), face: vi.fn() };
    const signs = new Signs({ store, ground, rules, places: PLACES });
    left.push(signs.start());
    say(store, "m1");
    expect(signs.snapshot().bubbles).toEqual([]);
    store.getState().chatActions.listed(LIST);
    expect(signs.snapshot().bubbles).toHaveLength(1);
  });

  it("shows no line of a room the list does not call public, nor one it does not hold", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    store.getState().chatActions.follow(["#earth", "#earth/kyoto", "#earth/ghost"]);
    say(store, "m1", { room: "#earth/kyoto" });
    say(store, "m2", { room: "#earth/ghost" });
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("shows none when the list could not load: it fails shut", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    store.getState().chatActions.listed(undefined);
    say(store, "m1");
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("shows no line of a country the speaker did not declare: it guesses none", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const parsed = parseLine(
      `@msgid=m1;time=${new Date().toISOString()};account=${ANN} :${ANN}!u@h PRIVMSG #earth :hello`,
    );
    if (!parsed.ok) throw new Error("no line");
    store.getState().chatActions.heard(parsed.message);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("gives far-side countries as counts, with the globe's own facing", async () => {
    const { store, signs, ground, stop } = await started();
    left.push(stop);
    ground.facing.mockReturnValue({ lat: 36, lon: 138 });
    say(store, "m1", { country: "BR" });
    expect(signs.snapshot().bubbles).toEqual([]);
    expect(signs.snapshot().counts).toEqual([{ country: "BR", count: 1, far: true }]);
  });

  it("reads the facing at each pick: a country the globe turned away from leaves within a second", async () => {
    const { store, signs, ground, stop } = await started();
    left.push(stop);
    say(store, "m1");
    expect(signs.snapshot().bubbles).toHaveLength(1);
    ground.facing.mockReturnValue({ lat: -36, lon: -42 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("does not ask the store again for a change that holds no line", async () => {
    const { store, ground, stop } = await started();
    left.push(stop);
    ground.facing.mockClear();
    store.getState().loginActions.chat("off");
    expect(ground.facing).not.toHaveBeenCalled();
    say(store, "m1");
    expect(ground.facing).toHaveBeenCalled();
  });

  it("reads no direct message, whatever country it declares: it has no room here", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1", { room: ME });
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().bubbles).toEqual([]);
    expect(signs.snapshot().counts).toEqual([]);
    expect(signs.snapshot().trends).toEqual([]);
  });
});

describe("what leaves at once (F3366)", () => {
  it("takes a redacted line's bubble off in the same task, not at the next second", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    expect(signs.snapshot().bubbles).toHaveLength(1);
    store.getState().chatActions.heard(redact("m1"));
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("takes off a bubble whose line the moderation hides", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    store.getState().verdictActions.judged({ msgid: "m1", room: "#earth", state: "hidden" });
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("leaves a line the moderation checked and passed", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    store.getState().verdictActions.judged({ msgid: "m1", room: "#earth", state: "checked" });
    expect(signs.snapshot().bubbles).toHaveLength(1);
  });

  it("takes every bubble off when the link drops: a line kept to read is no bubble", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    store.getState().chatActions.disconnected();
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("takes off the bubbles of a room the reader left", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1", { room: "#earth/help" });
    store.getState().chatActions.follow(["#earth"]);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("takes off a room's bubbles when the next list says it turned private", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1", { room: "#earth/help" });
    expect(signs.snapshot().bubbles).toHaveLength(1);
    store.getState().chatActions.listed([{ name: null, rooms: [{ room: "#earth/help", type: "members" }] }]);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("takes off every bubble when the next list could not load, for it can vouch for no room", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    say(store, "m1");
    store.getState().chatActions.listed(undefined);
    expect(signs.snapshot().bubbles).toEqual([]);
  });
});

describe("your own line", () => {
  it("turns the globe to your country, once a line", async () => {
    const { store, ground, stop } = await started();
    left.push(stop);
    ground.facing.mockReturnValue({ lat: 0, lon: -100 });
    say(store, "m1", { from: ME, country: "FR" });
    expect(ground.face).toHaveBeenCalledTimes(1);
    expect(ground.face).toHaveBeenCalledWith({ lat: 46.7, lon: 2.6 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ground.face).toHaveBeenCalledTimes(1);
  });

  it("turns again for your next line", async () => {
    const { store, ground, stop } = await started();
    left.push(stop);
    say(store, "m1", { from: ME, country: "FR" });
    await vi.advanceTimersByTimeAsync(1000);
    say(store, "m2", { from: ME, country: "JP" });
    expect(ground.face).toHaveBeenLastCalledWith({ lat: 36.1, lon: 138.4 });
  });

  it("never turns for another's line", async () => {
    const { store, ground, stop } = await started();
    left.push(stop);
    say(store, "m1");
    expect(ground.face).not.toHaveBeenCalled();
  });

  it("shows no bubble of yours and no turn for an old line that history brought back", async () => {
    const { store, signs, ground, stop } = await started();
    left.push(stop);
    say(store, "m1", { from: ME, country: "FR", at: NOW - rules.maxAgeSeconds * 1000 - 1 });
    expect(signs.snapshot().bubbles).toEqual([]);
    expect(ground.face).not.toHaveBeenCalled();
  });

  it("turns for no line of yours with no country, nor one in a room the list calls private", async () => {
    const { store, ground, stop } = await started();
    left.push(stop);
    store.getState().chatActions.follow(["#earth", "#earth/kyoto"]);
    const parsed = parseLine(`@msgid=m1;time=${new Date().toISOString()};account=${ME} :${ME}!u@h PRIVMSG #earth :hi`);
    if (!parsed.ok) throw new Error("no line");
    store.getState().chatActions.heard(parsed.message);
    say(store, "m2", { from: ME, country: "FR", room: "#earth/kyoto" });
    expect(ground.face).not.toHaveBeenCalled();
  });
});

describe("the pills", () => {
  const HOUR = 3_600_000;
  it("gives a country's trend once two hours of its lines are held", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const { chatActions } = store.getState();
    const lines = [
      ...Array.from({ length: 10 }, (_, n) => heard(`b${String(n)}`, { at: NOW - HOUR - 60_000 * (n + 1) })),
      ...Array.from({ length: 15 }, (_, n) => heard(`a${String(n)}`, { at: NOW - 60_000 * (n + 1) })),
    ];
    chatActions.page("#earth", [heard("old", { at: NOW - 3 * HOUR }), ...lines]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().trends).toEqual([{ country: "JP", percent: 50 }]);
  });

  it("gives none from a window that does not reach two hours back: the count before it would be a lie", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const lines = [
      ...Array.from({ length: 10 }, (_, n) => heard(`b${String(n)}`, { at: NOW - HOUR - 60_000 * (n + 1) })),
      ...Array.from({ length: 15 }, (_, n) => heard(`a${String(n)}`, { at: NOW - 60_000 * (n + 1) })),
    ];
    store.getState().chatActions.page("#earth", lines);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().trends).toEqual([]);
  });

  const earlier = (room: string, recent: number, before: number) => [
    ...Array.from({ length: before }, (_, n) =>
      heard(`${room}b${String(n)}`, { at: NOW - HOUR - 60_000 * (n + 1), room }),
    ),
    ...Array.from({ length: recent }, (_, n) => heard(`${room}a${String(n)}`, { at: NOW - 60_000 * (n + 1), room })),
  ];

  it("takes a window whose oldest line is exactly two hours old, and none a millisecond short of it", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const { chatActions } = store.getState();
    chatActions.page("#earth", [heard("short", { at: NOW - 2 * HOUR + 1 }), ...earlier("#earth", 15, 9)]);
    expect(signs.snapshot().trends).toEqual([]);
    chatActions.page("#earth", [heard("edge", { at: NOW - 2 * HOUR })]);
    expect(signs.snapshot().trends).toEqual([{ country: "JP", percent: 50 }]);
  });

  it("leaves out a room whose window is short: its hour before would be undercounted, and the pill inflated", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const { chatActions } = store.getState();
    chatActions.page("#earth", [heard("old", { at: NOW - 3 * HOUR }), ...earlier("#earth", 10, 10)]);
    chatActions.page("#earth/help", earlier("#earth/help", 40, 0));
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().trends).toEqual([]);
  });

  it("shows no pill for a room so busy that its kept lines cover less than two hours: it says nothing rather than guess", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    const busy = Array.from({ length: 200 }, (_, n) => heard(`l${String(n)}`, { at: NOW - 30_000 * (n + 1) }));
    store.getState().chatActions.page("#earth", busy);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().trends).toEqual([]);
  });

  it("counts no private room's line in a public trend", async () => {
    const { store, signs, stop } = await started();
    left.push(stop);
    store.getState().chatActions.follow(["#earth", "#earth/kyoto"]);
    const lines = [
      heard("old", { at: NOW - 3 * HOUR, room: "#earth/kyoto" }),
      ...Array.from({ length: 10 }, (_, n) =>
        heard(`b${String(n)}`, { at: NOW - HOUR - 60_000 * (n + 1), room: "#earth/kyoto" }),
      ),
      ...Array.from({ length: 15 }, (_, n) =>
        heard(`a${String(n)}`, { at: NOW - 60_000 * (n + 1), room: "#earth/kyoto" }),
      ),
    ];
    store.getState().chatActions.page("#earth/kyoto", lines);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signs.snapshot().trends).toEqual([]);
  });
});

describe("the pins", () => {
  it("pins a public room with a place, with its name and its address on this page", async () => {
    const { signs, stop } = await started();
    left.push(stop);
    expect(signs.snapshot().pins).toEqual([
      { room: "#earth/lisbon", label: "#lisbon", href: "?room=lisbon", lat: 38.7, lon: -9.1 },
    ]);
  });

  it("leaves a room with no place to the list", async () => {
    const { signs, stop } = await started();
    left.push(stop);
    expect(signs.snapshot().pins.map(({ room }) => room)).not.toContain("#earth/help");
  });

  it("pins no private room, and no place whose room the reader does not see", async () => {
    const { signs, stop } = await started();
    left.push(stop);
    const rooms = signs.snapshot().pins.map(({ room }) => room);
    expect(rooms).not.toContain("#earth/kyoto");
    expect(rooms).not.toContain("#earth/nowhere");
  });

  it("pins nothing while the list is not read", () => {
    const { store, signs } = setup();
    store.getState().chatActions.listed(undefined);
    left.push(signs.start());
    expect(signs.snapshot().pins).toEqual([]);
  });
});

describe("its life", () => {
  it("stops its second and its store with the page", async () => {
    const { store, signs, stop } = await started();
    stop();
    say(store, "m1");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(signs.snapshot().bubbles).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does nothing while the page is hidden, for no reader sees it, and picks up as it comes back", async () => {
    const { store, signs, ground, stop } = await started();
    left.push(stop);
    say(store, "m1");
    ground.facing.mockClear();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ground.facing).not.toHaveBeenCalled();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(SHOW);
    expect(signs.snapshot().bubbles).toEqual([]);
  });

  it("gives the ground no mark itself: the page's elements are what stand on it", async () => {
    const { ground, stop } = await started();
    left.push(stop);
    expect(ground.setMarks).not.toHaveBeenCalled();
  });
});
