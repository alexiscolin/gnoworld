import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageNoticePrefs } from "./page.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "localStorage");
});

// 4f-n: an account's notification modes live in the page's localStorage, as its direct-message choices do.
describe("the page's notification modes", () => {
  it("keeps an account's modes in the page's localStorage, under its key", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
    });
    expect(pageNoticePrefs(ALICE).setModes({ "#bubble": "none" })).toBe(true);
    expect([...kept.keys()]).toEqual([`gnoworld:notices:${ALICE}:modes`]);
    expect(pageNoticePrefs(ALICE).modes()).toEqual({ "#bubble": "none" });
  });

  it("reads nothing and keeps nothing when the page's localStorage cannot be reached, throwing nothing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The storage is blocked.", "SecurityError");
      },
    });
    expect(pageNoticePrefs(ALICE).modes()).toBeUndefined();
    expect(pageNoticePrefs(ALICE).setModes({ "#bubble": "none" })).toBe(false);
  });
});
