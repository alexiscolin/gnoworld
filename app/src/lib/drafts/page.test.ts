import { Address } from "@gnoworld/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageDrafts } from "./page.ts";

const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("the page's drafts", () => {
  it("keeps an account's drafts in the page's localStorage, under its key", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => kept.set(key, value),
      removeItem: (key: string) => kept.delete(key),
    });
    expect(pageDrafts(ALICE).set("#bubble", "x")).toBe(true);
    expect([...kept.entries()]).toEqual([[`gnoworld:draft:${ALICE}:#bubble`, "x"]]);
    expect(pageDrafts(ALICE).get("#bubble")).toBe("x");
  });

  it("reads none and keeps none when the page's localStorage cannot be reached, throwing nothing", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The storage is blocked.", "SecurityError");
      },
    });
    expect(pageDrafts(ALICE).get("#bubble")).toBe("");
    expect(pageDrafts(ALICE).set("#bubble", "x")).toBe(false);
  });
});
