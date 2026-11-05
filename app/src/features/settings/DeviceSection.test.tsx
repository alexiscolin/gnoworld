// @vitest-environment jsdom
import { Address } from "@gnoworld/schemas";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, one, settled } from "../../../tests/mount.tsx";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { passportFile } from "../../lib/keep/device.ts";
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
  "gnoworld:device:reminders": { e1: { fired: false } },
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

  it("offer no clear of saved messages or drafts to a guest", async () => {
    const box = await section();
    expect(all(box, "button").map((each) => each.textContent)).toEqual(["Export the passport", "Clear the passport"]);
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
    vi.unstubAllGlobals();
    expect(clicked).toHaveBeenCalledOnce();
    expect(JSON.parse((await made[0]?.text()) ?? "{}")).toEqual({
      gnoworld: "passport",
      version: 1,
      stamps: { "onyx:a": "2026-11-01", "onyx:b": "2026-11-02" },
      charted: { "onyx:a": "2026-11-01" },
    });
  });
});
