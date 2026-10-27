import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageDmPrefs } from "./page.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "localStorage");
});

// 4e: an account's direct-message choices live in the page's localStorage, as its drafts do.
describe("the page's direct-message choices", () => {
  it("keeps an account's choices in the page's localStorage, under its keys", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
    });
    expect(pageDmPrefs(ALICE).setKnown([BOB])).toBe(true);
    expect([...kept.keys()]).toEqual([`gnoworld:dm:${ALICE}:known`]);
    expect(pageDmPrefs(ALICE).known()).toEqual([BOB]);
  });

  it("reads nothing and keeps nothing when the page's localStorage cannot be reached, throwing nothing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The storage is blocked.", "SecurityError");
      },
    });
    expect(pageDmPrefs(ALICE).known()).toBeUndefined();
    expect(pageDmPrefs(ALICE).setKnown([BOB])).toBe(false);
  });
});
