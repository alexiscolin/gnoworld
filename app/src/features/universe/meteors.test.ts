// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { meteorPath } from "./meteors.ts";

// 8p's meteors (frames 4, 6, 7): a path never over the hero's text, nor into the rail's or the ticker's bands.
const VIEW = { width: 1728, height: 1080 };
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe("a meteor's path", () => {
  it("keeps clear of the hero's box, the rail and the ticker, on many seeds", () => {
    const hero = { left: 0, top: 640, right: 900, bottom: 1040 };
    for (let seed = 1; seed < 200; seed += 1) {
      const path = meteorPath(seeded(seed), VIEW, [hero]);
      if (path === undefined) continue;
      const end = { x: path.x + Math.cos(path.angle) * 540, y: path.y + Math.sin(path.angle) * 540 };
      expect(end.x).toBeLessThan(VIEW.width - 160);
      expect(end.y).toBeLessThan(VIEW.height - 60);
      expect(
        Math.max(path.x, end.x) + 32 <= hero.left ||
          Math.max(path.y, end.y) + 32 <= hero.top ||
          path.x - 32 >= hero.right,
      ).toBe(true);
    }
  });

  it("gives none where the text fills the sky", () => {
    expect(meteorPath(seeded(7), VIEW, [{ left: 0, top: 0, right: 1728, bottom: 1080 }])).toBeUndefined();
  });
});
