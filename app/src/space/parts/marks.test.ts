import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Plate } from "./marks.ts";

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
