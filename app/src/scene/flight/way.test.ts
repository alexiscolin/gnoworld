// @vitest-environment jsdom
import { PerspectiveCamera } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Way } from "./way.ts";

// A way between two looks in the cosmos (7g): camera-controls turns from one theta to the other the way the numbers lie, so two looks
// either side of ±π would swing nearly a whole turn the long way round (lot A's review, F3711).
describe("a way round the cosmos", () => {
  // What the way cannot act on it reports, as the browser's reportError does; jsdom has none.
  beforeEach(() => {
    vi.stubGlobal("reportError", vi.fn());
  });

  it("turns the short way round when its looks lie either side of ±π", () => {
    const way = new Way();
    const at = (theta: number) => ({ x: 10 * Math.sin(theta), y: 0, z: 10 * Math.cos(theta) });
    const look = { x: 0, y: 0, z: 0 };
    const from = { eye: at(Math.PI - 0.1), look, up: { x: 0, y: 1, z: 0 } };
    way.arc(from, { eye: at(-Math.PI + 0.1), look }, { travel: { x: 0, y: 0, z: 0 }, keepLook: true });
    const ride = {
      eye: { travel: { x: 0, y: 0, z: 0 }, look: undefined },
      arrival: { approach: 1, aside: 0 },
      camera: new PerspectiveCamera(),
    };
    let [turned, last] = [0, Math.atan2(from.eye.x, from.eye.z)];
    for (let step = 1; step <= 50; step += 1) {
      way.write(step / 50, ride);
      const theta = Math.atan2(from.eye.x + ride.eye.travel.x, from.eye.z + ride.eye.travel.z);
      const delta = theta - last;
      turned += Math.abs(delta - 2 * Math.PI * Math.round(delta / (2 * Math.PI)));
      last = theta;
    }
    expect(turned).toBeLessThan(0.3);
    way.dispose();
  });
});
