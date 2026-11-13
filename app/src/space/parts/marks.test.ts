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
