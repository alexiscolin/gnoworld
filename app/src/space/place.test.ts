import { EARTH } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { bringsEarth } from "./place.ts";

describe("bringsEarth", () => {
  it("is the home's first screen and the Earth's own page: its full maps are asked as the flight starts", () => {
    expect(bringsEarth({ kind: "home" })).toBe(true);
    expect(bringsEarth({ kind: "world", id: EARTH })).toBe(true);
  });

  it("is no other place: the galaxy, a system, another world", () => {
    expect(bringsEarth({ kind: "universe" })).toBe(false);
    expect(bringsEarth({ kind: "system", id: "gov" })).toBe(false);
    expect(bringsEarth({ kind: "world", id: "govdao" })).toBe(false);
  });
});
