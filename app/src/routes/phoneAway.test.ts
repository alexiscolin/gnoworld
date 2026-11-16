import { afterEach, expect, it, vi } from "vitest";
import { phoneAway } from "./phoneAway.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});
const window = (phone: boolean, recent = "") => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query === "(max-width: 899px)" }));
  vi.stubGlobal("localStorage", { getItem: () => recent, setItem: () => undefined });
};

it("sends a phone into the Earth's full chat, in the universe's own prefix, never a computer", () => {
  window(true);
  expect(phoneAway("/")?.headers.get("Location")).toBe("/earth?chat=full");
  const away = phoneAway("/net/gnoland");
  expect(away?.status).toBe(302);
  expect(away?.headers.get("Location")).toBe("/net/gnoland/earth?chat=full");
  window(false);
  expect(phoneAway("/")).toBeUndefined();
});

it("sends a phone back to the last world it was in", () => {
  window(true, "/r/gno.land/r/x\n/w/bubble");
  expect(phoneAway("/")?.headers.get("Location")).toBe("/w/bubble?chat=full");
});
