// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, one, settled } from "../../../tests/mount.tsx";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { passportFile } from "../../lib/keep/device.ts";
import { keep } from "../../lib/keep/keep.ts";
import { DeviceSection } from "./DeviceSection.tsx";

// The settings' "this device" (slice 8; plan §6: "clear removes what it names and nothing else"; the threat model's "an import is size-capped,
// parsed, never merged field by field"): the passport cleared or replaced whole, an account's saved messages and drafts cleared apart.
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

let store: AppStore | undefined;
async function section(account?: Address) {
  const mounted = await mountInStore(<DeviceSection account={account} />);
  store = mounted.store;
  const box = mounted.box;
  await settled(() => store?.getState().device.readable === true);
  return box;
}
const press = (box: HTMLElement, words: string) => {
  const found = all(box, "button").find((each) => each.textContent === words);
  expect(found, words).toBeDefined();
  act(() => {
    found?.click();
  });
};
const said = (box: HTMLElement) => one(box, "[role='status']").textContent;
const held = (key: string): unknown => JSON.parse(localStorage.getItem(key) ?? "null");

// Every other thing the device keeps, which no clear of the passport may touch.
const OTHERS: Record<string, unknown> = {
  "gnoworld:device:settings": { quality: "low", calm: true, phone3d: false },
  "gnoworld:device:streak": { day: "2026-11-05", count: 2, best: 3 },
  "gnoworld:device:expedition": { day: "2026-11-05", reached: ["onyx:a"] },
  "gnoworld:device:quests": { named: ["read"] },
  "gnoworld:device:follows": { worlds: ["onyx:a"], people: [] },
  [`gnoworld:draft:${ALICE}:#bubble`]: "hello",
  [`gnoworld:draft:${BOB}:#bubble`]: "bob's",
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("gnoworld:device:stamps", JSON.stringify({ "onyx:a": "2026-11-01", "onyx:b": "2026-11-02" }));
  localStorage.setItem("gnoworld:device:charted", JSON.stringify({ "onyx:a": "2026-11-01" }));
  for (const [key, value] of Object.entries(OTHERS))
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function imported(box: HTMLElement, text: string) {
  const input = one(box, "input[type='file']") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File([text], "p.json")], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((done) => setTimeout(done, 0));
  });
}

describe("this device's settings", () => {
  it("say how many stamps the passport holds", async () => {
    const box = await section();
    expect(box.textContent).toContain("Your passport holds 2 stamps");
  });

  it("clear the passport, its stamps and worlds charted, and nothing else", async () => {
    const box = await section(ALICE);
    press(box, "Clear the passport");
    expect(said(box)).toBe("Passport cleared.");
    expect(localStorage.getItem("gnoworld:device:stamps")).toBeNull();
    expect(localStorage.getItem("gnoworld:device:charted")).toBeNull();
    for (const [key, value] of Object.entries(OTHERS))
      expect(typeof value === "string" ? localStorage.getItem(key) : held(key), key).toEqual(value);
    expect(box.textContent).toContain("Your passport holds 0 stamps");
  });

  it("clear an account's drafts alone, never another account's nor the passport", async () => {
    const box = await section(ALICE);
    press(box, "Clear drafts");
    expect(said(box)).toBe("Drafts cleared.");
    expect(localStorage.getItem(`gnoworld:draft:${ALICE}:#bubble`)).toBeNull();
    expect(localStorage.getItem(`gnoworld:draft:${BOB}:#bubble`)).toBe("bob's");
    expect(held("gnoworld:device:stamps")).toEqual({ "onyx:a": "2026-11-01", "onyx:b": "2026-11-02" });
  });

  it("clear an account's saved messages alone, never its drafts, the passport, the settings nor another device field", async () => {
    const mine = keep(() => localStorage, ALICE);
    const bobs = keep(() => localStorage, BOB);
    const saved = (account: Address, id: string) => ({
      room: "#bubble",
      id,
      time: "2026-11-05T10:00:00.000Z",
      from: account,
      account,
      text: `kept ${id}`,
    });
    mine.setSaved([saved(ALICE, "m1"), saved(ALICE, "m2")]);
    bobs.setSaved([saved(BOB, "m3")]);
    const box = await section(ALICE);
    act(() => {
      store?.getState().keepActions.begin(mine);
    });
    expect(store?.getState().keep.saved).toHaveLength(2);
    const before = Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]));
    press(box, "Clear saved messages");
    expect(said(box)).toBe("Saved messages cleared.");
    expect(store?.getState().keep.saved).toEqual([]);
    expect(mine.saved()).toEqual([]);
    expect(localStorage.getItem(`gnoworld:saved:${ALICE}`)).toBeNull();
    const after = Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]));
    expect(after).toEqual(
      Object.fromEntries(Object.entries(before).filter(([key]) => key !== `gnoworld:saved:${ALICE}`)),
    );
    expect(bobs.saved()).toEqual([saved(BOB, "m3")]);
  });

  it("leave the saved messages intact when the passport is cleared", async () => {
    const mine = keep(() => localStorage, ALICE);
    const line = {
      room: "#bubble",
      id: "m1",
      time: "2026-11-05T10:00:00.000Z",
      from: ALICE,
      account: ALICE,
      text: "kept",
    };
    mine.setSaved([line]);
    const box = await section(ALICE);
    act(() => {
      store?.getState().keepActions.begin(mine);
    });
    press(box, "Clear the passport");
    expect(mine.saved()).toEqual([line]);
    expect(store?.getState().keep.saved).toEqual([line]);
  });

  it("offer no clear of saved messages or drafts to a guest", async () => {
    const box = await section();
    // The passport's file is exported or read back through a button of its own (the ping-pong's batch, f7a31433), then cleared.
    expect(all(box, "button").map((each) => each.textContent)).toEqual([
      "Export the passport",
      "Import a passport",
      "Clear the passport",
    ]);
  });

  it("replace the passport whole from a file, never merged entry by entry", async () => {
    const box = await section();
    await imported(box, passportFile({ stamps: { "onyx:z": "2026-10-01" }, charted: {} }));
    expect(said(box)).toBe("Passport imported.");
    expect(held("gnoworld:device:stamps")).toEqual({ "onyx:z": "2026-10-01" });
    expect(localStorage.getItem("gnoworld:device:charted")).toBeNull();
    expect(held("gnoworld:device:streak")).toEqual(OTHERS["gnoworld:device:streak"]);
  });

  it("change nothing for a file that is no passport", async () => {
    const box = await section();
    await imported(box, JSON.stringify({ gnoworld: "passport", version: 2, stamps: {}, charted: {} }));
    expect(said(box)).toBe("That file is no gnoworld passport: nothing changed.");
    expect(held("gnoworld:device:stamps")).toEqual({ "onyx:a": "2026-11-01", "onyx:b": "2026-11-02" });
  });

  it("say so when the device does not keep the clear", async () => {
    const box = await section();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    press(box, "Clear the passport");
    expect(said(box)).toBe("This device did not keep it.");
  });

  it("export the passport as a file of the reader's own", async () => {
    const box = await section();
    const made: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (blob: Blob) => {
        made.push(blob);
        return "blob:passport";
      },
      revokeObjectURL: () => undefined,
    });
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    press(box, "Export the passport");
    expect(clicked).toHaveBeenCalledOnce();
    expect(JSON.parse((await made[0]?.text()) ?? "{}")).toEqual({
      gnoworld: "passport",
      version: 1,
      stamps: { "onyx:a": "2026-11-01", "onyx:b": "2026-11-02" },
      charted: { "onyx:a": "2026-11-01" },
    });
  });
});
