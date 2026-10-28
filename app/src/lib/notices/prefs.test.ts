import { Address } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { MODES_KEPT, noticePrefs } from "./prefs.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

// A device's storage, as the page's localStorage behaves: strings by key, any call refused when it is; `failRead`
// makes the next read alone throw.
function storage({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  const refuse = () => {
    if (refuses) throw new DOMException("The storage is blocked.", "SecurityError");
  };
  let failing = false;
  return {
    kept,
    failRead: () => {
      failing = true;
    },
    getItem: (key: string) => {
      refuse();
      if (failing) {
        failing = false;
        throw new DOMException("The storage failed.", "UnknownError");
      }
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
const on = (device: ReturnType<typeof storage>, account: Address) => noticePrefs(() => device, account);
const rooms = (count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, at) => [`#bubble/r${String(at)}`, "none" as const]));

// 4f-n: a room's notification mode (all, mentions, none) kept on the device, each account's apart (ADR-0002, "Menu and
// settings": notifications are a setting of the device).
describe("an account's notification modes on the device", () => {
  it("knows no mode of its own until one is kept, then gives it back, each account's apart", () => {
    const device = storage();
    expect(on(device, ALICE).modes()).toEqual({});
    expect(on(device, ALICE).setModes({ "#bubble": "all", "#bubble/games": "none" })).toBe(true);
    expect(on(device, ALICE).modes()).toEqual({ "#bubble": "all", "#bubble/games": "none" });
    expect(on(device, BOB).modes()).toEqual({});
  });

  it("keeps its modes under the account's address in one key of its own", () => {
    const device = storage();
    on(device, ALICE).setModes({ "#bubble": "all" });
    expect([...device.kept.keys()]).toEqual([`gnoworld:notices:${ALICE}:modes`]);
  });

  it("keeps up to MODES_KEPT rooms, and none past it", () => {
    const device = storage();
    expect(on(device, ALICE).setModes(rooms(MODES_KEPT))).toBe(true);
    expect(Object.keys(on(device, ALICE).modes() ?? {})).toHaveLength(MODES_KEPT);
    expect(on(device, ALICE).setModes(rooms(MODES_KEPT + 1))).toBe(false);
    expect(Object.keys(on(device, ALICE).modes() ?? {})).toHaveLength(MODES_KEPT);
  });

  // What the device gives back is data from outside the page: checked, else forgotten with its key.
  it.each([
    ["text that is no JSON", "{"],
    ["a list", '["#bubble"]'],
    ["null", "null"],
    ["a mode that is none of the three", '{"#bubble":"loud"}'],
    ["a number for a mode", '{"#bubble":1}'],
    ["a key that is no room's id", '{"bubble":"all"}'],
    ["a key that is a prototype's", '{"__proto__":"all"}'],
    ["a room's id with a capital", '{"#Bubble":"all"}'],
    ["more rooms than it keeps", JSON.stringify(rooms(MODES_KEPT + 1))],
  ])("forgets what the device gives back when it is %s", (_, held) => {
    const device = storage();
    device.kept.set(`gnoworld:notices:${ALICE}:modes`, held);
    expect(on(device, ALICE).modes()).toEqual({});
    expect(device.kept.has(`gnoworld:notices:${ALICE}:modes`)).toBe(false);
  });

  it("reads none when the device cannot be read, and leaves what it holds as it is", () => {
    const device = storage();
    on(device, ALICE).setModes({ "#bubble": "all" });
    device.failRead();
    expect(on(device, ALICE).modes()).toBeUndefined();
    expect(on(device, ALICE).modes()).toEqual({ "#bubble": "all" });
  });

  it("says the device refused when it does, reading and keeping nothing, throwing nothing", () => {
    const device = storage({ refuses: true });
    expect(on(device, ALICE).modes()).toBeUndefined();
    expect(on(device, ALICE).setModes({ "#bubble": "all" })).toBe(false);
  });
});
