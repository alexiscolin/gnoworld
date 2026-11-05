// @vitest-environment jsdom
import type { Clump } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THIN } from "../offTheBox.ts";
import { WebNames } from "./webNames.ts";

describe("8h's pills", () => {
  // The whole cosmos's names (7u, 8m): a pill over each of the biggest clumps, hidden where it would cover another, the page's text, or a
  // clump thinned out round that text.
  const SCREEN = { width: 1000, height: 800 };
  const PILL = { width: 80, height: 20 };

  // jsdom lays nothing out: a pill is the box its translate puts it in, anchored at its bottom centre as the stylesheet says.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(this: HTMLElement) {
      const [x = 0, y = 0] = [...this.style.transform.matchAll(/(-?\d+)px/g)]
        .slice(0, 2)
        .map((found) => Number(found[1]));
      return new DOMRect(x - PILL.width / 2, y - PILL.height, PILL.width, PILL.height);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  const clump = (id: string, [x, y]: [number, number], real = 20): Clump => ({
    id,
    real,
    worlds: real,
    score: real,
    centre: { x, y, z: 0 },
    radius: 0,
    landmark: { x, y, z: 0 },
  });
  // The view's -1 to 1 are the screen's, y up.
  const project = (at: { x: number; y: number; z: number }) => new Vector3(at.x, at.y, 0);
  const shown = () =>
    [...document.querySelectorAll<HTMLElement>("body > div > div")].filter((pill) => pill.style.display !== "none");

  function placed(
    clumps: Clump[],
    box?: { left: number; top: number; right: number; bottom: number },
    width = SCREEN.width,
  ) {
    const names = new WebNames(document);
    names.stand(clumps);
    names.show(true);
    names.place(project, { ...SCREEN, width, box });
    return shown();
  }

  describe("the cosmos's name pills", () => {
    it("stands a pill for each clump of twelve real worlds or more, and none for a smaller one", () => {
      expect(placed([clump("big", [0, 0]), clump("small", [0.5, 0], 11)]).map((pill) => pill.textContent)).toEqual([
        "big20 worlds",
      ]);
    });

    it("hides the smaller of two pills that would cover each other", () => {
      expect(placed([clump("a", [0, 0], 30), clump("b", [0.01, 0], 20)]).map((pill) => pill.textContent)).toEqual([
        "a30 worlds",
      ]);
    });

    it("shows four at most on a phone", () => {
      const row = ["a", "b", "c", "d", "e", "f"].map((id, at) => clump(id, [0, -0.8 + at * 0.3], 30 - at));
      expect(placed(row, undefined, 500)).toHaveLength(4);
      document.body.replaceChildren();
      expect(placed(row)).toHaveLength(6);
    });

    it("hides a pill that would stand in the page's text", () => {
      const centre = { x: SCREEN.width / 2, y: SCREEN.height / 2 };
      const over = { left: centre.x - 10, right: centre.x + 10, top: centre.y - 30, bottom: centre.y + 10 };
      expect(placed([clump("a", [0, 0])], over)).toHaveLength(0);
    });

    it("hides a pill whose clump is within THIN of the text, though the pill itself is clear of it", () => {
      const centre = { x: SCREEN.width / 2, y: SCREEN.height / 2 };
      const beside = (gap: number) => ({
        left: centre.x + PILL.width / 2 + 5 + gap,
        right: centre.x + 400,
        top: centre.y - 100,
        bottom: centre.y + 100,
      });
      const near = beside(0);
      expect(near.left).toBeLessThan(centre.x + THIN);
      expect(placed([clump("a", [0, 0])], near)).toHaveLength(0);
      document.body.replaceChildren();
      const far = beside(THIN);
      expect(far.left).toBeGreaterThan(centre.x + THIN);
      expect(placed([clump("a", [0, 0])], far)).toHaveLength(1);
    });
  });
});

describe("8n's pills", () => {
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
});
