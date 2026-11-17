import { describe, expect, it } from "vitest";
import { orbitCrowd } from "./marks.ts";

// A crowded system's orbits each fainter, so that together they stay lines; but never fainter than half (D13756): gno.land's system,
// fifty planets and more, kept its orbits too pale to read.
describe("a system's orbits' share of their light", () => {
  it("is whole in a small system", () => {
    expect(orbitCrowd(5)).toBe(1);
  });

  it("is never under half, fifty planets or five hundred", () => {
    expect(orbitCrowd(50)).toBe(0.5);
    expect(orbitCrowd(500)).toBe(0.5);
  });

  it("falls with the planets' count between the two", () => {
    expect(orbitCrowd(20)).toBeLessThan(orbitCrowd(15));
    expect(orbitCrowd(20)).toBeGreaterThan(0.5);
  });
});
