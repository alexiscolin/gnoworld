// @vitest-environment jsdom
import { Drawn } from "@gnoworld/core";
import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CosmosLabels, type Seen } from "./labelled.ts";

// The labels' way in (7h): the Earth's label stands by the globe wherever it is, and hides while it has not come, wherever the projection
// would put the place it waits at.
const SCREEN = { width: 1728, height: 1080, box: undefined };
// An eye 10 units behind the stage's origin: the place the Earth's label waits at is in front of it.
const projector: Seen["projector"] = {
  sight: SCREEN,
  seen(at: Vector3, radius: number) {
    return { x: SCREEN.width / 2 + at.x * 20, y: SCREEN.height / 2 - at.y * 20, radius: radius * 20, depth: 10 - at.z };
  },
  anchorOf: () => undefined,
};
const shown = () =>
  [...(document.querySelector("[data-labels]")?.children ?? [])].filter(
    (slot) => slot instanceof HTMLElement && slot.style.opacity === "1",
  );

// jsdom lays nothing out: each pill is given frame 4's size.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(32);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the labels' way in", () => {
  it("keeps the Earth's label hidden until the globe has come, then stands it by the globe", () => {
    const globe: { at?: Vector3 } = {};
    const part = new CosmosLabels(document, { projector, earth: () => globe.at });
    part.list([], undefined);
    part.look([], new Drawn(), []);
    part.tick({ x: 0, y: 0, z: 0 }, true);
    expect(shown()).toHaveLength(0);
    globe.at = new Vector3(0, 0, -20);
    part.tick({ x: 0, y: 0, z: 0 }, true);
    expect(shown()).toHaveLength(1);
    expect(shown()[0]?.textContent).toContain("Earth");
    part.dispose();
  });
});
