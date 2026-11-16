import { afterEach, expect, it, vi } from "vitest";
import { phoneAway } from "./phoneAway.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});
const window = (phone: boolean) => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query === "(max-width: 899px)" }));
};

it("sends a phone to the universe's home, never a computer", () => {
  window(true);
  const away = phoneAway("/net/onyx");
  expect(away?.status).toBe(302);
  expect(away?.headers.get("Location")).toBe("/net/onyx");
  window(false);
  expect(phoneAway("/")).toBeUndefined();
});
