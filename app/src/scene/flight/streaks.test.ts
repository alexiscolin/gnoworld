import { DoubleSide, Mesh, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { Streaks } from "./streaks.ts";

// Frames 18, 36 and 101 streak with many short soft dashes, two to four pixels wide and of varied light, where the flights drew a few
// long hairlines: lines are one pixel wide on every GPU (three 0.187, LineBasicMaterial: "always render line primitives with a width of
// one pixel"). Each dash is two triangles now (the design review, F3708).
describe("the streaks", () => {
  const read = (streaks: Streaks, name: string) => [...streaks.mesh.geometry.getAttribute(name).array];

  it("draws each dash as two triangles, either side of its line, its six corners sharing one place and one light", () => {
    const streaks = new Streaks();
    expect(streaks.mesh).toBeInstanceOf(Mesh);
    // Its triangles turn either way on screen, as its line goes: one side alone culled them all.
    expect(streaks.mesh.material.side).toBe(DoubleSide);
    const [at, side, shade] = [read(streaks, "aAt"), read(streaks, "aSide"), read(streaks, "aShade")];
    const dashes = side.length / 6;
    expect(dashes).toBeGreaterThanOrEqual(1500);
    expect(new Set(side)).toEqual(new Set([-1, 1]));
    for (let dash = 0; dash < dashes; dash += 1) {
      const corners = [0, 1, 2, 3, 4, 5].map((corner) => dash * 6 + corner);
      expect(new Set(corners.map((corner) => shade[corner]))).toHaveProperty("size", 1);
      expect(new Set(corners.map((corner) => at[corner * 3]))).toHaveProperty("size", 1);
    }
    streaks.dispose();
  });

  it("gives its dashes light of their own, from dim to full", () => {
    const streaks = new Streaks();
    const shade = read(streaks, "aShade");
    expect(Math.min(...shade)).toBeLessThan(0.6);
    expect(Math.max(...shade)).toBeGreaterThan(0.9);
    streaks.dispose();
  });

  it("sizes its dashes in the drawing buffer's pixels", () => {
    const streaks = new Streaks();
    streaks.pixel(new Vector2(1000, 500));
    expect(streaks.mesh.material.uniforms["uPixel"]?.value).toEqual(new Vector2(0.002, 0.004));
    streaks.dispose();
  });
});
