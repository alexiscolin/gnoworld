// @vitest-environment jsdom
import type { Clump } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THIN } from "../offTheBox.ts";
import { WebNames } from "./webNames.ts";

// The whole cosmos's pills (7u, 8m): over the biggest clumps, none over another or the page's text, none naming a clump thinned out round
// the text, four at most on a phone. jsdom lays nothing out: a pill's box is read from where it was moved, 100 by 20 px over its point.
const SIZE = 1000;
const clump = (id: string, [x, y]: readonly [number, number], real = 40): Clump => ({
  id,
  real,
  worlds: 3,
  score: real,
  centre: { x, y, z: 0 },
  radius: 0,
  landmark: { x, y, z: 0 },
});
// The view's -1 to 1 from the screen's pixels: a clump stands where the test says, its pill over it.
const at = (px: number) => (2 * px) / SIZE - 1;
const project = ({ x, y, z }: { x: number; y: number; z: number }) => new Vector3(x, y, z);
const shown = () =>
  [...document.querySelectorAll<HTMLElement>("body > div > div")]
    .filter((pill) => pill.style.display !== "none")
    .map((pill) => pill.firstElementChild?.textContent);

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
    const [x = 0, y = 0] = [...this.style.transform.matchAll(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/g)].flatMap(
      ([, a = "0", b = "0"]) => [Number(a), Number(b)],
    );
    return DOMRect.fromRect({ x: x - 50, y: y - 20, width: 100, height: 20 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the whole cosmos's pills", () => {
  const box = { left: 0, top: 0, right: 400, bottom: 400 };

  it("names a clump far from the text, and none whose middle stands within the thinned band round it", () => {
    const names = new WebNames(document);
    // Each pill clear of the box itself; the near clump's middle THIN - 10 px right of it, the far one's THIN + 10.
    names.stand([clump("far", [at(400 + THIN + 10), -at(700)]), clump("near", [at(400 + THIN - 10), -at(200)])]);
    names.place(project, { width: SIZE, height: SIZE, box });
    expect(shown()).toEqual(["far"]);
    names.place(project, { width: SIZE, height: SIZE, box: undefined });
    expect(shown()).toEqual(["far", "near"]);
  });

  it("names no clump too small, nor one whose pill would cover a bigger one's", () => {
    const names = new WebNames(document);
    names.stand([
      clump("big", [at(700), -at(700)], 90),
      clump("under", [at(720), -at(705)], 50),
      clump("small", [at(900), -at(900)], 11),
    ]);
    names.place(project, { width: SIZE, height: SIZE, box: undefined });
    expect(shown()).toEqual(["big"]);
  });

  it("names four at most on a phone", () => {
    const names = new WebNames(document);
    names.stand(
      Array.from({ length: 6 }, (_, n) => clump(`c${String(n)}`, [at(100 + 70 * n), -at(150 * (n + 1))], 60 - n)),
    );
    names.place(project, { width: 500, height: SIZE, box: undefined });
    expect(shown()).toEqual(["c0", "c1", "c2", "c3"]);
  });

  it("hides a pill over the text, behind the eye or off the screen, and names a clump of twelve real particles, never eleven", () => {
    const names = new WebNames(document);
    const behind = { ...clump("behind", [at(700), -at(300)]), centre: { x: at(700), y: -at(300), z: 2 } };
    names.stand([
      clump("over", [at(300), -at(390)]),
      behind,
      clump("edge", [at(20), -at(700)]),
      clump("twelve", [at(800), -at(800)], 12),
      clump("eleven", [at(600), -at(600)], 11),
    ]);
    names.place(project, { width: SIZE, height: SIZE, box: { left: 0, top: 0, right: 400, bottom: 380 } });
    expect(shown()).toEqual(["twelve"]);
  });

  // G5: twelve at most on a computer, the biggest kept; the biggest first, whatever order the clumps come in.
  it("names twelve at most on a computer, the biggest, and the biggest first where two meet", () => {
    const names = new WebNames(document);
    const many = Array.from({ length: 13 }, (_, n) =>
      clump(`c${String(n)}`, [at(80 + 70 * n), -at(100 + 60 * n)], 20 + n),
    );
    names.stand(many);
    names.place(project, { width: SIZE, height: SIZE, box: undefined });
    expect(shown().sort()).toEqual(
      many
        .slice(1)
        .map(({ id }) => id)
        .sort(),
    );
    names.stand([clump("small", [at(700), -at(700)], 30), clump("big", [at(720), -at(705)], 90)]);
    names.place(project, { width: SIZE, height: SIZE, box: undefined });
    expect(shown()).toEqual(["big"]);
  });
});
