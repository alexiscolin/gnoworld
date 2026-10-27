import { Address, toAddress } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { KNOWN_KEPT, dmPrefs } from "./prefs.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const CAROL = "g1l6m6l6carqlqqqqqqqqqqqqqqqqqqqqqnkkanc";

// A device's storage, as the page's localStorage behaves: strings by key, any call refused when it is; `failRead`
// makes the next read alone throw.
function storage({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  // Each write and removal, by key: what the account's reads must leave alone.
  const touched: string[] = [];
  const refuse = () => {
    if (refuses) throw new DOMException("The storage is blocked.", "SecurityError");
  };
  let failing = false;
  return {
    kept,
    touched,
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
      touched.push(key);
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      refuse();
      touched.push(key);
      kept.delete(key);
    },
  };
}
const on = (device: ReturnType<typeof storage>, account: Address) => dmPrefs(() => device, account);

// 4e: "only from people I have talked with" (ADR-0002, Chat), kept on the device, each account's apart.
describe("an account's direct-message preferences on the device", () => {
  it("lets anyone write until the account asks for those it talked with alone, and keeps that choice", () => {
    const device = storage();
    expect(on(device, ALICE).onlyKnown()).toBe(false);
    expect(on(device, ALICE).setOnlyKnown(true)).toBe(true);
    expect(on(device, ALICE).onlyKnown()).toBe(true);
    expect(on(device, BOB).onlyKnown()).toBe(false);
    on(device, ALICE).setOnlyKnown(false);
    expect(on(device, ALICE).onlyKnown()).toBe(false);
  });

  it("keeps the accounts it wrote to in their order, each account's apart", () => {
    const device = storage();
    expect(on(device, ALICE).known()).toEqual([]);
    expect(on(device, ALICE).setKnown([CAROL, BOB])).toBe(true);
    expect(on(device, ALICE).known()).toEqual([CAROL, BOB]);
    expect(on(device, BOB).known()).toEqual([]);
  });

  it(`keeps the ${String(KNOWN_KEPT)} accounts last written to`, () => {
    const device = storage();
    const mine = on(device, ALICE);
    // Addresses of their own, each one's 20 bytes holding its number.
    const many = Array.from({ length: KNOWN_KEPT + 1 }, (_, n) =>
      toAddress(Uint8Array.from([n >> 8, n & 255, ...new Array<number>(18).fill(0)])),
    );
    mine.setKnown(many);
    expect(mine.known()).toEqual(many.slice(1));
  });

  it(`reads the ${String(KNOWN_KEPT)} accounts a device holds, and none from a list one longer`, () => {
    const device = storage();
    on(device, ALICE).setKnown([BOB]);
    const [key = ""] = [...device.kept.keys()].filter((k) => k.endsWith(":known"));
    const many = Array.from({ length: KNOWN_KEPT + 1 }, (_, n) =>
      toAddress(Uint8Array.from([n >> 8, n & 255, ...new Array<number>(18).fill(0)])),
    );
    device.kept.set(key, JSON.stringify(many.slice(1)));
    expect(on(device, ALICE).known()).toEqual(many.slice(1));
    device.kept.set(key, JSON.stringify(many));
    expect(on(device, ALICE).known()).toEqual([]);
    expect(device.kept.has(key)).toBe(false);
  });

  // /code-review on 4e (CR4): a read that threw read as no account, and the write after it put one over the 500 kept.
  it("tells a device it could not read from one that holds no account", () => {
    const device = storage();
    const mine = on(device, ALICE);
    mine.setKnown([BOB]);
    device.failRead();
    expect(mine.known()).toBeUndefined();
    expect(mine.known()).toEqual([BOB]);
  });

  it("reads what the device holds as nothing unless it is a list of addresses, and forgets it", () => {
    const device = storage();
    on(device, ALICE).setKnown([BOB]);
    const [key = ""] = [...device.kept.keys()].filter((k) => k.endsWith(":known"));
    for (const held of ["not json", JSON.stringify(["not an address"]), JSON.stringify({ a: 1 })]) {
      device.kept.set(key, held);
      expect(on(device, ALICE).known()).toEqual([]);
      expect(device.kept.has(key)).toBe(false);
    }
  });

  // StrykerJS on 4e: a device holding nothing is read, never written.
  it("reads no account from a device that holds none, and writes nothing to it", () => {
    const device = storage();
    expect(on(device, ALICE).known()).toEqual([]);
    expect(on(device, ALICE).onlyKnown()).toBe(false);
    expect(device.touched).toEqual([]);
  });

  it("keeps nothing, reads the defaults and throws nothing when the device refuses", () => {
    const mine = on(storage({ refuses: true }), ALICE);
    expect(mine.onlyKnown()).toBe(false);
    expect(mine.setOnlyKnown(true)).toBe(false);
    expect(mine.setKnown([BOB])).toBe(false);
    expect(mine.known()).toBeUndefined();
    const blocked = dmPrefs(() => {
      throw new DOMException("The storage is blocked.", "SecurityError");
    }, ALICE);
    expect(blocked.known()).toBeUndefined();
    expect(blocked.setKnown([BOB])).toBe(false);
  });

  it("keeps them under keys of its own account, which another's cannot reach", () => {
    const device = storage();
    on(device, ALICE).setOnlyKnown(true);
    on(device, ALICE).setKnown([BOB]);
    expect([...device.kept.keys()].sort()).toEqual([`gnoworld:dm:${ALICE}:known`, `gnoworld:dm:${ALICE}:only-known`]);
  });
});
