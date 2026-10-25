import { describe, expect, it } from "vitest";
import { DRAFT_LIMIT, drafts } from "./drafts.ts";

const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// A device's storage, as the page's localStorage behaves: strings by key, any of its calls refused when it is.
function storage({ refuses = false } = {}) {
  const kept = new Map<string, string>();
  const refuse = () => {
    if (refuses) throw new DOMException("The storage is blocked.", "SecurityError");
  };
  return {
    kept,
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
const on = (device: ReturnType<typeof storage>, account: string) => drafts(() => device, account);

describe("an account's drafts on the device", () => {
  it("keeps a draft for its room, as typed, and gives nothing for a room with none", () => {
    const device = storage();
    const mine = on(device, ALICE);
    expect(mine.set("#bubble/games", "see you **tonight** ")).toBe(true);
    expect(mine.get("#bubble/games")).toBe("see you **tonight** ");
    expect(mine.get("#bubble")).toBe("");
    expect(on(device, ALICE).get("#bubble/games")).toBe("see you **tonight** ");
  });

  it("keeps each account's and each room's apart: one never reads another's", () => {
    const device = storage();
    on(device, ALICE).set("#bubble", "alice's");
    expect(on(device, BOB).get("#bubble")).toBe("");
    on(device, BOB).set("#bubble", "bob's");
    on(device, ALICE).set("#bubble/games", "another room");
    expect(on(device, ALICE).get("#bubble")).toBe("alice's");
    expect(on(device, BOB).get("#bubble")).toBe("bob's");
    expect(on(device, BOB).get("#bubble/games")).toBe("");
  });

  it("forgets a draft made blank, keeping no key for it, and writes none for nothing", () => {
    const device = storage();
    const mine = on(device, ALICE);
    expect(mine.set("#bubble", "")).toBe(true);
    expect(device.kept.size).toBe(0);
    mine.set("#bubble", "half a thought");
    expect(mine.set("#bubble", "   ")).toBe(true);
    expect(mine.get("#bubble")).toBe("");
    expect(device.kept.size).toBe(0);
  });

  it(`keeps a draft of ${String(DRAFT_LIMIT)} UTF-16 units at most, the last one kept left as it was`, () => {
    expect(DRAFT_LIMIT).toBe(4000);
    const mine = on(storage(), ALICE);
    expect(mine.set("#bubble", "😀".repeat(DRAFT_LIMIT / 2))).toBe(true);
    expect(mine.set("#bubble", "😀".repeat(DRAFT_LIMIT / 2 + 1))).toBe(false);
    expect(mine.get("#bubble")).toBe("😀".repeat(DRAFT_LIMIT / 2));
  });

  it("reads what the device holds as no draft unless it is one: past the limit, it is none", () => {
    const device = storage();
    on(device, ALICE).set("#bubble", "kept");
    const [key = ""] = device.kept.keys();
    device.kept.set(key, "x".repeat(DRAFT_LIMIT + 1));
    expect(on(device, ALICE).get("#bubble")).toBe("");
  });

  it("says a draft was not kept when the device refuses it, reads none, and throws nothing", () => {
    const mine = on(storage({ refuses: true }), ALICE);
    expect(mine.set("#bubble", "a draft")).toBe(false);
    expect(mine.set("#bubble", "  ")).toBe(false);
    expect(mine.get("#bubble")).toBe("");
  });

  it("reads none and keeps none when the device's storage cannot even be reached", () => {
    const blocked = drafts(() => {
      throw new DOMException("The storage is blocked.", "SecurityError");
    }, ALICE);
    expect(blocked.get("#bubble")).toBe("");
    expect(blocked.set("#bubble", "a draft")).toBe(false);
  });

  it("keeps a draft under a key of its own account and room, which another's cannot reach", () => {
    const device = storage();
    on(device, ALICE).set("#bubble/games", "x");
    expect([...device.kept.keys()]).toEqual([`gnoworld:draft:${ALICE}:#bubble/games`]);
  });

  it("keeps nothing for no account: a guest's drafts would be every guest's", () => {
    const device = storage();
    const nobody = on(device, "");
    expect(nobody.set("#bubble", "a draft")).toBe(false);
    expect(nobody.get("#bubble")).toBe("");
    expect(device.kept.size).toBe(0);
  });
});
