// @vitest-environment jsdom
import type { Clump } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THIN } from "../offTheBox.ts";
import { WebNames } from "./webNames.ts";

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
