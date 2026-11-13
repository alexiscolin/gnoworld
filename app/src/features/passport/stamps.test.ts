import { describe, expect, it } from "vitest";
import { stampsOf } from "./stamps.ts";

describe("the system a stamp names", () => {
  const of = (id: string, hubs: string[] = []) =>
    stampsOf({
      universe: "onyx",
      universeName: "Onyx",
      stamps: { [`onyx:${id}`]: "2026-11-12" },
      charted: {},
      nameOf: (each) => each,
      worlds: [],
      hubs: new Set(hubs),
    })[0]?.system;

  it("is the namespace of a world id with a slash", () => {
    expect(of("games/chess")).toBe("games");
  });

  it("is the id itself for a realm alone in its namespace, not the universe's name", () => {
    expect(of("alice")).toBe("alice");
  });

  it("is the universe's name for the Earth and for a hub", () => {
    expect(of("earth")).toBe("Onyx");
    expect(of("bubble", ["bubble"])).toBe("Onyx");
  });
});
