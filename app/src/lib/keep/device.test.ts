import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageDevice, passportFile, readPassportFile } from "./device.ts";
import { DEFAULT_SETTINGS, DEVICE_EMPTY, FOLLOWS_KEPT } from "./fields.ts";

// What this device keeps for whoever uses it (slice 8; the plan's threat model, "Device store"): each field one key, read through its
// schema; garbage, a huge file and another version never crash nor lie; an entry that is none is dropped and kept aside, written back; a
// device that refuses is read as unreadable. And the passport's file: export then import is the identity, a bad file changes nothing.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";

function storage() {
  const words = new Map<string, string>();
  const state = { blocked: false, full: false };
  return {
    words,
    state,
    getItem: (key: string) => {
      if (state.blocked) throw new DOMException("blocked", "SecurityError");
      return words.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (state.blocked || state.full) throw new DOMException("full", "QuotaExceededError");
      words.set(key, value);
    },
    removeItem: (key: string) => {
      if (state.blocked) throw new DOMException("blocked", "SecurityError");
      words.delete(key);
    },
  };
}

let held: ReturnType<typeof storage>;
beforeEach(() => {
  held = storage();
  vi.stubGlobal("localStorage", held);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const put = (field: string, value: unknown) => {
  held.words.set(`gnoworld:device:${field}`, typeof value === "string" ? value : JSON.stringify(value));
};
const stored = (field: string): unknown => {
  const text = held.words.get(`gnoworld:device:${field}`);
  return text === undefined ? undefined : JSON.parse(text);
};

describe("a field read from the device", () => {
  it("is its default when the device holds none", () => {
    const device = pageDevice();
    for (const field of Object.keys(DEVICE_EMPTY) as (keyof typeof DEVICE_EMPTY)[])
      expect(device.read(field)).toEqual(DEVICE_EMPTY[field]);
  });

  it("names each field's key under gnoworld:device:", () => {
    expect(pageDevice().keys.stamps).toBe("gnoworld:device:stamps");
    expect(pageDevice().keys.settings).toBe("gnoworld:device:settings");
  });

  it.each([
    ["not JSON", "{oops"],
    ["a number", "42"],
    ["null", "null"],
    ["an array", "[1,2]"],
    ["a string", '"stamps"'],
  ])("forgets a record field holding %s: its default, and the key removed", (_, text) => {
    put("stamps", text);
    expect(pageDevice().read("stamps")).toEqual({});
    expect(held.words.has("gnoworld:device:stamps")).toBe(false);
  });

  it("forgets a streak or an expedition of another version (a field more, a field less)", () => {
    put("streak", { day: "2026-11-05", count: 2, best: 2, extra: 1 });
    put("expedition", { day: "2026-11-05" });
    const device = pageDevice();
    expect(device.read("streak")).toBeNull();
    expect(device.read("expedition")).toBeNull();
    expect(held.words.size).toBe(0);
  });

  it("forgets a streak whose count is negative, fractional or past its bound", () => {
    for (const count of [-1, 1.5, 100_001]) {
      put("streak", { day: "2026-11-05", count, best: 2 });
      expect(pageDevice().read("streak")).toBeNull();
    }
  });

  it("reads a streak and today's expedition as kept", () => {
    put("streak", { day: "2026-11-05", count: 2, best: 4 });
    put("expedition", { day: "2026-11-05", reached: ["gnoland:a"] });
    const device = pageDevice();
    expect(device.read("streak")).toEqual({ day: "2026-11-05", count: 2, best: 4 });
    expect(device.read("expedition")).toEqual({ day: "2026-11-05", reached: ["gnoland:a"] });
  });

  it("drops a stamp that is none and keeps it aside, written back with the next write", () => {
    put("stamps", {
      "gnoland:a": "2026-11-01",
      "gnoland:b": "yesterday",
      "with space": "2026-11-01",
      "": "2026-11-01",
      "gnoland:c": "2026-13-01",
    });
    const device = pageDevice();
    expect(device.read("stamps")).toEqual({ "gnoland:a": "2026-11-01" });
    expect(device.write("stamps", { "gnoland:a": "2026-11-01", "gnoland:d": "2026-11-05" })).toBe(true);
    expect(stored("stamps")).toEqual({
      "gnoland:a": "2026-11-01",
      "gnoland:b": "yesterday",
      "with space": "2026-11-01",
      "": "2026-11-01",
      "gnoland:c": "2026-13-01",
      "gnoland:d": "2026-11-05",
    });
  });

  it("refuses a key over 256 characters or holding a control character", () => {
    put("stamps", { [`gnoland:${"x".repeat(260)}`]: "2026-11-01", "gnoland:a\u0007": "2026-11-01" });
    expect(pageDevice().read("stamps")).toEqual({});
  });

  it("reads a key of 256 characters and refuses one of 257", () => {
    const at = (length: number) => `g:${"k".repeat(length - 2)}`;
    put("stamps", { [at(256)]: "2026-11-01", [at(257)]: "2026-11-02" });
    expect(pageDevice().read("stamps")).toEqual({ [at(256)]: "2026-11-01" });
  });

  it("reads a __proto__ key with a stamp as an own entry, and keeps a hostile value aside without polluting any prototype", () => {
    held.words.set("gnoworld:device:stamps", '{"__proto__":{"polluted":1}}');
    const device = pageDevice();
    const read = device.read("stamps") ?? {};
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(read).toEqual({});
    device.write("stamps", { "gnoland:a": "2026-11-01" });
    expect(Object.getPrototypeOf(stored("stamps"))).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    held.words.set("gnoworld:device:stamps", '{"__proto__":"2026-11-01"}');
    const own = pageDevice().read("stamps") ?? {};
    expect(Object.getPrototypeOf(own)).toBe(Object.prototype);
    expect(Object.keys(own)).toEqual(["__proto__"]);
  });

  it("keeps 10,000 stamps at most, the rest kept aside", () => {
    const many = Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [`gnoland:w${String(i)}`, "2026-11-01"]));
    put("stamps", many);
    const read = pageDevice().read("stamps") ?? {};
    expect(Object.keys(read)).toHaveLength(10_000);
    expect(read).not.toHaveProperty("gnoland:w10000");
  });

  it("reads each setting apart: one unreadable takes its default, a newer page's is kept and written back", () => {
    put("settings", { quality: "ultra", calm: true, phone3d: "yes", subtitles: "fr" });
    const device = pageDevice();
    expect(device.read("settings")).toEqual({ ...DEFAULT_SETTINGS, calm: true });
    device.write("settings", { quality: "low", calm: true, phone3d: false });
    expect(stored("settings")).toEqual({ quality: "low", calm: true, phone3d: false, subtitles: "fr" });
  });

  it("reads a setting named like an object's own key as a newer page's, never as a setting", () => {
    put("settings", { toString: true, constructor: "x", calm: true });
    expect(pageDevice().read("settings")).toEqual({ ...DEFAULT_SETTINGS, calm: true });
  });

  it("reads the follows apart: a world's key, a person's address, each once, the others dropped", () => {
    put("follows", {
      worlds: ["gnoland:a", "gnoland:a", 3, "", "gnoland:b"],
      people: [ALICE, "noor", ALICE, null],
      later: [1],
    });
    const device = pageDevice();
    expect(device.read("follows")).toEqual({ worlds: ["gnoland:a", "gnoland:b"], people: [ALICE] });
    device.write("follows", { worlds: ["gnoland:c"], people: [] });
    expect(stored("follows")).toEqual({ later: [1], worlds: ["gnoland:c"], people: [] });
  });

  it("keeps FOLLOWS_KEPT follows at most, the first ones (the last followed)", () => {
    put("follows", { worlds: Array.from({ length: FOLLOWS_KEPT + 3 }, (_, i) => `gnoland:w${String(i)}`) });
    const read = pageDevice().read("follows");
    expect(read?.worlds).toHaveLength(FOLLOWS_KEPT);
    expect(read?.worlds[0]).toBe("gnoland:w0");
    expect(read?.people).toEqual([]);
  });

  it("reads a reminder's fired flag, and drops one of another shape", () => {
    put("reminders", { e1: { fired: false }, e2: { fired: "no" }, e3: { fired: true, at: 1 } });
    expect(pageDevice().read("reminders")).toEqual({ e1: { fired: false } });
  });

  it("forgets the notifications read when their shape is another", () => {
    put("notificationsRead", { through: "not a time", ids: [] });
    expect(pageDevice().read("notificationsRead")).toEqual(DEVICE_EMPTY.notificationsRead);
    put("notificationsRead", { through: "2026-11-05T10:00:00.000Z", ids: ["n1"] });
    expect(pageDevice().read("notificationsRead")).toEqual({ through: "2026-11-05T10:00:00.000Z", ids: ["n1"] });
  });

  it("drops a quest's steps past 64 or that are none", () => {
    put("quests", { q1: ["s1", "s2"], q2: Array.from({ length: 65 }, (_, i) => `s${String(i)}`), q3: [""] });
    expect(pageDevice().read("quests")).toEqual({ q1: ["s1", "s2"] });
  });

  it("is unreadable (undefined) when the device refuses, and the key is left as it is", () => {
    put("stamps", { "gnoland:a": "2026-11-01" });
    held.state.blocked = true;
    expect(pageDevice().read("stamps")).toBeUndefined();
    held.state.blocked = false;
    expect(stored("stamps")).toEqual({ "gnoland:a": "2026-11-01" });
  });

  it("is unreadable when reaching the storage itself throws", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(pageDevice().read("settings")).toBeUndefined();
    expect(pageDevice().write("settings", DEFAULT_SETTINGS)).toBe(false);
  });
});

describe("a field written to the device", () => {
  it("removes the key for its default", () => {
    put("settings", { quality: "low", calm: false, phone3d: false });
    const device = pageDevice();
    device.read("settings");
    expect(device.write("settings", DEFAULT_SETTINGS)).toBe(true);
    expect(held.words.has("gnoworld:device:settings")).toBe(false);
  });

  it("says false when the device is full, and keeps what it held", () => {
    put("stamps", { "gnoland:a": "2026-11-01" });
    held.state.full = true;
    expect(pageDevice().write("stamps", { "gnoland:b": "2026-11-02" })).toBe(false);
    expect(stored("stamps")).toEqual({ "gnoland:a": "2026-11-01" });
  });

  it("reads back what it wrote, field by field", () => {
    const device = pageDevice();
    device.write("streak", { day: "2026-11-05", count: 3, best: 3 });
    device.write("reminders", { e1: { fired: true } });
    device.write("quests", { q1: ["s1"] });
    const again = pageDevice();
    expect(again.read("streak")).toEqual({ day: "2026-11-05", count: 3, best: 3 });
    expect(again.read("reminders")).toEqual({ e1: { fired: true } });
    expect(again.read("quests")).toEqual({ q1: ["s1"] });
  });
});

describe("the passport's file", () => {
  const passport = () => ({
    stamps: { "gnoland:a": "2026-11-01", "gnoland:gno.land/r/gov/dao": "2026-11-04" },
    charted: { "gnoland:a": "2026-11-01" },
  });

  it("reads back what it exported: the identity", () => {
    expect(readPassportFile(passportFile(passport()))).toEqual(passport());
    expect(readPassportFile(passportFile({ stamps: {}, charted: {} }))).toEqual({ stamps: {}, charted: {} });
  });

  it("is versioned and named a gnoworld passport", () => {
    expect(JSON.parse(passportFile(passport()))).toMatchObject({ gnoworld: "passport", version: 1 });
  });

  it.each([
    ["not JSON", () => "{"],
    ["another kind", () => JSON.stringify({ ...JSON.parse(passportFile(passport())), gnoworld: "drafts" })],
    ["another version", () => JSON.stringify({ ...JSON.parse(passportFile(passport())), version: 2 })],
    ["a version as text", () => JSON.stringify({ ...JSON.parse(passportFile(passport())), version: "1" })],
    ["an array", () => "[]"],
    ["no stamps", () => JSON.stringify({ gnoworld: "passport", version: 1, charted: {} })],
    ["stamps as a list", () => JSON.stringify({ gnoworld: "passport", version: 1, stamps: [], charted: {} })],
    [
      "one stamp that is none",
      () => passportFile({ stamps: { ...passport().stamps, "gnoland:b": "soon" }, charted: {} }),
    ],
    ["one charted key that is none", () => passportFile({ stamps: {}, charted: { "bad key": "2026-11-01" } })],
  ])("reads nothing from %s", (_, file) => {
    expect(readPassportFile(file())).toBeUndefined();
  });

  it("reads a key of 256 characters and refuses one of 257, whole or not at all", () => {
    const at = (length: number) => `g:${"k".repeat(length - 2)}`;
    expect(readPassportFile(passportFile({ stamps: { [at(256)]: "2026-11-01" }, charted: {} }))?.stamps).toEqual({
      [at(256)]: "2026-11-01",
    });
    expect(readPassportFile(passportFile({ stamps: {}, charted: { [at(257)]: "2026-11-01" } }))).toBeUndefined();
  });

  it("pollutes no prototype and reads plain objects from a hostile __proto__ value", () => {
    const file = '{"gnoworld":"passport","version":1,"stamps":{"__proto__":{"polluted":1}},"charted":{}}';
    const read = readPassportFile(file);
    expect(Object.getPrototypeOf(read?.stamps)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("reads a __proto__ key with a day as an own entry of a plain object", () => {
    const file = '{"gnoworld":"passport","version":1,"stamps":{"__proto__":"2026-11-01"},"charted":{}}';
    const read = readPassportFile(file);
    expect(Object.getPrototypeOf(read?.stamps)).toBe(Object.prototype);
    expect(Object.keys(read?.stamps ?? {})).toEqual(["__proto__"]);
  });

  it("reads nothing from a file over 2,000,000 characters, and reads one at the bound", () => {
    const base = passportFile({ stamps: {}, charted: {} });
    const pad = (length: number) => base.replace("{", `{${" ".repeat(length - base.length)}`);
    expect(readPassportFile(pad(2_000_000))).toEqual({ stamps: {}, charted: {} });
    expect(readPassportFile(pad(2_000_001))).toBeUndefined();
  });

  it("reads nothing from a file of more stamps than the device keeps: whole or not at all", () => {
    const stamps = Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [`g:w${String(i)}`, "2026-11-01"]));
    expect(readPassportFile(passportFile({ stamps, charted: {} }))).toBeUndefined();
  });
});
