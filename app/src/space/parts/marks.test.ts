import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ORBIT_COLOUR, orbitCrowd, orbitGain, Plate } from "./marks.ts";

describe("Plate.sync", () => {
  it("is not drawn while its fill is under half a level, and is once it rises", () => {
    const plate = new Plate();
    plate.shown.value = 0;
    plate.sync();
    expect(plate.mesh.visible).toBe(false);
    plate.shown.value = 0.01;
    plate.sync();
    expect(plate.mesh.visible).toBe(true);
    plate.shown.value = 0.001;
    plate.sync();
    expect(plate.mesh.visible).toBe(false);
  });

  it("covers the box and two pixels round it once it knows the frame's width, the frame before", () => {
    const plate = new Plate();
    expect(plate.mesh.material.uniforms["uWidth"]?.value).toBe(0);
    plate.place({ left: 10, top: 20, right: 110, bottom: 220 }, 50, { width: 400, height: 300, ratio: 2 });
    expect(plate.mesh.material.uniforms["uWidth"]?.value).toBe(800);
  });
});

// The plate's fill the scene paints (marks.ts) and the token a plate's cards lay their wash on where the scene paints it
// (--p-plate-scene, through --plate-ground): one colour in two languages, read from both files, never copied.
it("paints the plate in the colour the cards lay their wash on", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const shader = /beforeGrade\(\[([\d.]+), ([\d.]+), ([\d.]+)\]\)/.exec(read("./marks.ts"))?.slice(1).map(Number) ?? [];
  const hex = /--p-plate-scene:\s*#([0-9a-f]{6});/.exec(read("../../../../packages/ui/src/tokens.css"))?.[1] ?? "";
  const token = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  expect(shader).toHaveLength(3);
  expect(token).toEqual(shader.map((channel) => Math.round(channel * 255)));
});

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

// The Map's orbits are lines one buffer pixel wide, written as they show (no grade): gno.land's seventeen measured 24 of 255 on the
// screen, half a page pixel wide on a screen of ratio 2, and were not seen.
describe("how strong the Map draws a system's orbits", () => {
  const PALE = 24;
  const [red, green, blue] = ORBIT_COLOUR;
  const shown = (planets: number, ratio: number) =>
    orbitGain(planets, ratio) * (0.2126 * red + 0.7152 * green + 0.0722 * blue) * 255;

  it.each([5, 20, 50, 500])(
    "shows a system of %i well over what was too pale, on a screen of ratio 1 or 2",
    (planets) => {
      expect(shown(planets, 1)).toBeGreaterThan(1.5 * PALE);
      expect(shown(planets, 2)).toBeGreaterThan(1.5 * PALE);
    },
  );

  it("gives a line half as thick, on a screen of ratio 2, twice the light (the screen's light goes by its value's power 2.2)", () => {
    expect((orbitGain(5, 2) / orbitGain(5, 1)) ** 2.2).toBeCloseTo(2, 5);
    expect((orbitGain(500, 1.5) / orbitGain(500, 1)) ** 2.2).toBeCloseTo(1.5, 5);
  });

  it("takes no light off a line drawn wider than a page pixel", () => {
    expect(orbitGain(5, 0.8)).toBe(orbitGain(5, 1));
  });

  it("stays under the screen's white, and a crowded system's under a small one's", () => {
    expect(orbitGain(5, 2) * Math.max(red, green, blue)).toBeLessThan(0.6);
    expect(orbitGain(500, 2)).toBeLessThan(orbitGain(5, 2));
  });
});
