import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keep, SAVED_KEPT, UNREAD_KEPT, type SavedLine } from "./keep.ts";
import { pageKeep } from "./page.ts";

// What an account keeps on its device (slice 4's 4d; ADR-0002 "Saved messages and drafts: Device", "Mark unread: 0, on
// the device"): the lines it saved, and for each room the reading place it asked to go back to. Both are the device's
// alone: no other device of the account sees them. What the device gives back is checked; one that refuses keeps nothing.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const saved = (id: string, over: Partial<SavedLine> = {}): SavedLine => ({
  room: "#bubble/games",
  id,
  time: "2026-10-25T10:00:00.000Z",
  from: BOB,
  account: BOB,
  text: `line ${id}`,
  ...over,
});

function storage({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  const state = { refuses };
  const refuse = () => {
    if (state.refuses) throw new DOMException("The storage is blocked.", "SecurityError");
  };
  return {
    kept,
    state,
    getItem: (key: string) => {
      refuse();
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      refuse();
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      refuse();
      kept.delete(key);
    },
  };
}
const on = (device: ReturnType<typeof storage>, account: Address) => keep(() => device, account);

describe("the lines an account saved, on its device", () => {
  it("keeps them as given, in their order, and reads them back", () => {
    const device = storage();
    const lines = [saved("m2"), saved("m1", { room: "#bubble", account: undefined, from: "guest-ab12cd" })];
    expect(on(device, ALICE).setSaved(lines)).toBe(true);
    expect(on(device, ALICE).saved()).toEqual(lines);
  });

  it("reads none for an account that saved none, and keeps each account's apart", () => {
    const device = storage();
    expect(on(device, ALICE).saved()).toEqual([]);
    on(device, ALICE).setSaved([saved("m1")]);
    expect(on(device, BOB).saved()).toEqual([]);
    expect([...device.kept.keys()]).toEqual([`gnoworld:saved:${ALICE}`]);
  });

  // The number is the decision's (ADR-0002's saved messages, 200 a device), not the code's own.
  it("keeps 200 lines, and refuses a 201st list whole, writing nothing", () => {
    const device = storage();
    const lines = (count: number) => Array.from({ length: count }, (_, n) => saved(`m${String(n)}`));
    expect(on(device, ALICE).setSaved(lines(200))).toBe(true);
    expect(on(device, ALICE).setSaved(lines(201))).toBe(false);
    expect(on(device, ALICE).saved()).toHaveLength(200);
    expect(SAVED_KEPT).toBe(200);
  });

  // The device's text is any text: a line that is not one is dropped, the others kept (never a throw, never a guess).
  it.each([
    ["an empty text", { text: "" }],
    ["a text past a line's 510 characters", { text: "x".repeat(511) }],
    ["a room that is no room's", { room: "bubble" }],
    ["a time in another form", { time: "yesterday" }],
    ["an author that is no address", { account: "alice" }],
    ["an id with a comma", { id: "a,b" }],
    ["a field it does not know", { html: "<b>" }],
  ])("drops a saved line with %s, and keeps the good ones beside it", (_, over) => {
    const device = storage();
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([saved("m1"), { ...saved("m2"), ...over }, saved("m3")]));
    expect(
      on(device, ALICE)
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(["m1", "m3"]);
  });

  // A newer page may add a field or a form: this page reads what it knows, and writes back what it did not read, so an
  // older tab never takes a newer page's lines with it (F1489, the code review's CR10).
  it("writes back the lines it could not read, beside its own", () => {
    const device = storage();
    const newer = { ...saved("m2"), pinnedBy: "a newer page" };
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([saved("m1"), newer]));
    const account = on(device, ALICE);
    expect(account.saved()?.map(({ id }) => id)).toEqual(["m1"]);
    expect(account.setSaved([saved("m3"), saved("m1")])).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:saved:${ALICE}`) ?? "null")).toEqual([saved("m3"), saved("m1"), newer]);
  });

  it("keeps the key for lines it could not read, when it saves none of its own", () => {
    const device = storage();
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([{ ...saved("m2"), pinnedBy: "a newer page" }]));
    const account = on(device, ALICE);
    expect(account.saved()).toEqual([]);
    expect(account.setSaved([])).toBe(true);
    expect(device.kept.has(`gnoworld:saved:${ALICE}`)).toBe(true);
  });

  it("writes back the places it could not read, beside its own", () => {
    const device = storage();
    device.kept.set(
      `gnoworld:unread:${ALICE}`,
      JSON.stringify({ "#bubble": "2026-10-25T10:00:00.000Z", "#newer": { at: "a newer form" } }),
    );
    const account = on(device, ALICE);
    expect(Object.keys(account.unread() ?? {})).toEqual(["#bubble"]);
    expect(account.setUnread({ "#games": "2026-10-25T11:00:00.000Z" })).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:unread:${ALICE}`) ?? "null")).toEqual({
      "#games": "2026-10-25T11:00:00.000Z",
      "#newer": { at: "a newer form" },
    });
  });

  // The saved lines' twin of the case above, for the places (R4 of redpass2-4dx).
  it("keeps the key for places it could not read, when it sets none of its own", () => {
    const device = storage();
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({ "#newer": { at: "a newer form" } }));
    const account = on(device, ALICE);
    expect(account.unread()).toEqual({});
    expect(account.setUnread({})).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:unread:${ALICE}`) ?? "null")).toEqual({
      "#newer": { at: "a newer form" },
    });
  });

  // What is held back is what the last read found: a line another tab withdrew since is not written back, and a read
  // that fails leaves the held set as it was (R5 of redpass2-4dx).
  it("writes back only what its last read could not read: a line another tab withdrew does not return", () => {
    const device = storage();
    const newer = { ...saved("m2"), pinnedBy: "a newer page" };
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([saved("m1"), newer]));
    const account = on(device, ALICE);
    account.saved();
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([saved("m1")]));
    account.saved();
    expect(account.setSaved([saved("m1")])).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:saved:${ALICE}`) ?? "null")).toEqual([saved("m1")]);
  });

  it("writes back only the places its last read could not read: one another tab withdrew does not return", () => {
    const device = storage();
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({ "#newer": { at: "a newer form" } }));
    const account = on(device, ALICE);
    account.unread();
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({}));
    account.unread();
    expect(account.setUnread({ "#games": "2026-10-25T11:00:00.000Z" })).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:unread:${ALICE}`) ?? "null")).toEqual({
      "#games": "2026-10-25T11:00:00.000Z",
    });
  });

  it("keeps what an earlier read could not read when a later read fails", () => {
    const device = storage();
    const newer = { ...saved("m2"), pinnedBy: "a newer page" };
    device.kept.set(`gnoworld:saved:${ALICE}`, JSON.stringify([newer]));
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({ "#newer": { at: "a newer form" } }));
    const account = on(device, ALICE);
    account.saved();
    account.unread();
    device.state.refuses = true;
    expect(account.saved()).toBeUndefined();
    expect(account.unread()).toBeUndefined();
    device.state.refuses = false;
    expect(account.setSaved([saved("m1")])).toBe(true);
    expect(account.setUnread({ "#games": "2026-10-25T11:00:00.000Z" })).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:saved:${ALICE}`) ?? "null")).toEqual([saved("m1"), newer]);
    expect(JSON.parse(device.kept.get(`gnoworld:unread:${ALICE}`) ?? "null")).toEqual({
      "#games": "2026-10-25T11:00:00.000Z",
      "#newer": { at: "a newer form" },
    });
  });

  it("lets a place it sets replace one of the same room it could not read", () => {
    const device = storage();
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({ "#bubble": "a newer form" }));
    const account = on(device, ALICE);
    expect(account.unread()).toEqual({});
    expect(account.setUnread({ "#bubble": "2026-10-25T10:00:00.000Z" })).toBe(true);
    expect(JSON.parse(device.kept.get(`gnoworld:unread:${ALICE}`) ?? "null")).toEqual({
      "#bubble": "2026-10-25T10:00:00.000Z",
    });
  });

  it.each([
    ["text that is no JSON", "{not json"],
    ["JSON that is no list", '{"a":1}'],
    ["a number", "7"],
  ])("forgets %s and reads none", (_, held) => {
    const device = storage();
    device.kept.set(`gnoworld:saved:${ALICE}`, held);
    expect(on(device, ALICE).saved()).toEqual([]);
    expect(device.kept.has(`gnoworld:saved:${ALICE}`)).toBe(false);
  });

  it("reads more than its cap as the first 200, a device written by another version never filling memory", () => {
    const device = storage();
    device.kept.set(
      `gnoworld:saved:${ALICE}`,
      JSON.stringify(Array.from({ length: 250 }, (_, n) => saved(`m${String(n)}`))),
    );
    expect(
      on(device, ALICE)
        .saved()
        ?.map(({ id }) => id),
    ).toEqual(Array.from({ length: 200 }, (_, n) => `m${String(n)}`));
  });

  it("reads more places than its cap as the first 100 rooms'", () => {
    const device = storage();
    device.kept.set(
      `gnoworld:unread:${ALICE}`,
      JSON.stringify(
        Object.fromEntries(Array.from({ length: 150 }, (_, n) => [`#w${String(n)}`, "2026-10-25T10:00:00.000Z"])),
      ),
    );
    expect(Object.keys(on(device, ALICE).unread() ?? {})).toHaveLength(100);
  });

  it("keeps nothing and says so when the device refuses, and says it could not be read (not that none are saved)", () => {
    const device = storage({ refuses: true });
    expect(on(device, ALICE).setSaved([saved("m1")])).toBe(false);
    expect(on(device, ALICE).saved()).toBeUndefined();
  });
});

describe("the places an account asked to go back to, on its device", () => {
  const PLACES = { "#bubble/games": "2026-10-25T10:00:59.999Z", "#bubble": "2026-10-25T09:00:00.000Z" };

  it("keeps a place for each room, as given, and reads them back", () => {
    const device = storage();
    expect(on(device, ALICE).setUnread(PLACES)).toBe(true);
    expect(on(device, ALICE).unread()).toEqual(PLACES);
    expect([...device.kept.keys()]).toEqual([`gnoworld:unread:${ALICE}`]);
  });

  it("reads none for an account with none, and keeps each account's apart", () => {
    const device = storage();
    expect(on(device, ALICE).unread()).toEqual({});
    on(device, ALICE).setUnread(PLACES);
    expect(on(device, BOB).unread()).toEqual({});
  });

  it("writes no key for no places", () => {
    const device = storage();
    on(device, ALICE).setUnread(PLACES);
    expect(on(device, ALICE).setUnread({})).toBe(true);
    expect(device.kept.size).toBe(0);
  });

  it("writes no key for no saved lines", () => {
    const device = storage();
    on(device, ALICE).setSaved([saved("m1")]);
    expect(on(device, ALICE).setSaved([])).toBe(true);
    expect(device.kept.size).toBe(0);
  });

  // A session joins 100 rooms at most (Ergo's max-channels-per-client), so no more places than that are of any use.
  it("keeps 100 rooms' places, and refuses a list of 101 whole, writing nothing", () => {
    const device = storage();
    const rooms = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, n) => [`#world-${String(n)}`, "2026-10-25T10:00:00.000Z"]));
    expect(on(device, ALICE).setUnread(rooms(100))).toBe(true);
    expect(on(device, ALICE).setUnread(rooms(101))).toBe(false);
    expect(Object.keys(on(device, ALICE).unread() ?? {})).toHaveLength(100);
    expect(UNREAD_KEPT).toBe(100);
  });

  it.each([
    ["a room that is no room's", { bubble: "2026-10-25T10:00:00.000Z" }],
    ["a time in another form", { "#bubble": "2026-10-25T10:00:00Z" }],
    ["a day that does not exist", { "#bubble": "2026-02-30T10:00:00.000Z" }],
    ["no time", { "#bubble": "" }],
  ])("drops a place with %s, keeping the good ones", (_, bad) => {
    const device = storage();
    device.kept.set(`gnoworld:unread:${ALICE}`, JSON.stringify({ ...bad, "#good": "2026-10-25T10:00:00.000Z" }));
    expect(on(device, ALICE).unread()).toEqual({ "#good": "2026-10-25T10:00:00.000Z" });
  });

  it("is never fooled by a room named __proto__, which would be a place for every room", () => {
    const device = storage();
    device.kept.set(
      `gnoworld:unread:${ALICE}`,
      '{"__proto__":"2026-10-25T10:00:00.000Z","#bubble":"2026-10-25T10:00:00.000Z"}',
    );
    const read = on(device, ALICE).unread();
    expect(Object.keys(read ?? {})).toEqual(["#bubble"]);
    expect(Object.hasOwn(read ?? {}, "__proto__")).toBe(false);
  });

  it("keeps nothing and reads none when the device refuses", () => {
    const device = storage({ refuses: true });
    expect(on(device, ALICE).setUnread(PLACES)).toBe(false);
    expect(on(device, ALICE).unread()).toBeUndefined();
  });
});

describe("the page's device", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("is the page's localStorage, reached at each use, throwing nothing when it is blocked", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
    });
    expect(pageKeep(ALICE).setSaved([saved("m1")])).toBe(true);
    expect([...kept.keys()]).toEqual([`gnoworld:saved:${ALICE}`]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The storage is blocked.", "SecurityError");
      },
    });
    expect(pageKeep(ALICE).saved()).toBeUndefined();
    expect(pageKeep(ALICE).setUnread({ "#bubble": "2026-10-25T10:00:00.000Z" })).toBe(false);
  });
});
