import { describe, expect, it } from "vitest";
import { at, PART_KINDS, UP, type Part, type PartKind } from "./parts.ts";
import type { Station } from "./station.ts";
import { alikeStations, lookOf } from "./variety.ts";

// A station's look read from parts set by hand, so each number of it has one answer (8n's StrykerJS run, 2026-11-05).
const part = (kind: PartKind, centre: Part["at"], across: number): Part => ({
  kind,
  finish: "hull",
  at: centre,
  axis: UP,
  size: at(across, 0.1, across),
  wheel: false,
});
const station = (parts: readonly Part[]): Station => ({
  seed: "test",
  size: 0.5,
  parts,
  spin: 0.1,
  spine: UP,
  turn: 0,
});

describe("a station's look (variety.ts)", () => {
  it("counts the parts of each kind", () => {
    const parts = [
      part("module", at(0, 0, 0), 0.2),
      part("module", at(0, 0.5, 0), 0.2),
      part("dish", at(0, -0.5, 0), 0.3),
    ];
    const counts = lookOf(station(parts)).counts;
    expect(counts).toEqual(PART_KINDS.map((kind) => (kind === "module" ? 2 : kind === "dish" ? 1 : 0)));
  });

  it("its reach along the spine and out from it are its farthest part's, either way", () => {
    const parts = [
      part("module", at(0.1, 0.2, 0), 0.2),
      part("module", at(0, -0.8, 0), 0.2),
      part("dish", at(-0.3, 0, -0.4), 0.2),
    ];
    const [along, out] = lookOf(station(parts)).shape;
    expect(along).toBe(0.8);
    expect(out).toBe(0.5);
  });

  it("its widest wheel is its widest ring or band, whatever the other parts' widths", () => {
    const centre = at(0, 0, 0);
    const banded = [
      part("module", centre, 0.9),
      part("ring", centre, 0.5),
      part("band", centre, 0.7),
      part("dish", centre, 0.95),
    ];
    expect(lookOf(station(banded)).shape[2]).toBe(0.7);
    const ringed = [part("module", centre, 0.9), part("ring", centre, 0.6), part("band", centre, 0.3)];
    expect(lookOf(station(ringed)).shape[2]).toBe(0.6);
    expect(lookOf(station([part("module", centre, 0.9)])).shape[2]).toBe(0);
  });

  it("a shape a tenth apart, or a shape with less to it, is a station apart", () => {
    const counts = PART_KINDS.map(() => 1);
    expect(alikeStations({ counts, shape: [0.1, 0, 0] }, { counts, shape: [0, 0, 0] })).toBe(false);
    expect(alikeStations({ counts, shape: [0.05, 0, 0] }, { counts, shape: [0, 0, 0] })).toBe(true);
    expect(alikeStations({ counts, shape: [0.095, 0, 0] }, { counts, shape: [0, 0, 0] })).toBe(true);
    expect(alikeStations({ counts, shape: [0, 0, 0] }, { counts, shape: [0, 0] })).toBe(false);
  });
});
