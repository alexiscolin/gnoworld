import { groundDirection } from "@gnoworld/core";
import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { turned, worldSun } from "./light.ts";

const DEGREE = Math.PI / 180;
const noon = (iso: string) => Date.parse(iso);
const base = new Quaternion().setFromEuler(new Euler(0.1, 0, -0.14));

// The world's direction from the planet's middle of the ground `g`, the planet turned by `angle` and carried by `group` (ground.ts, #normalOf).
const worldOf = (g: Vector3, angle: number, group: Quaternion) => turned(g.clone(), -angle).applyQuaternion(group);

describe("worldSun", () => {
  it("stands over the real noon: at an equinox noon UTC the sun is over Greenwich on the equator, at a June solstice 23.4 N", () => {
    const march = worldSun({ epochMs: noon("2026-03-20T12:00:00Z"), angle: 0, group: new Quaternion() }, new Vector3());
    expect(march.x).toBeGreaterThan(0.999);
    const june = worldSun({ epochMs: noon("2026-06-21T12:00:00Z"), angle: 0, group: new Quaternion() }, new Vector3());
    expect(Math.asin(june.y) / DEGREE).toBeCloseTo(23.44, 0);
    const six = worldSun({ epochMs: noon("2026-03-20T18:00:00Z"), angle: 0, group: new Quaternion() }, new Vector3());
    // six hours on the sun is a quarter turn west, within the equation of time (about 7 minutes, 2 degrees, that day)
    expect(Math.abs(Math.atan2(-six.z, six.x) / DEGREE + 90)).toBeLessThan(3);
  });

  it("turns with the Earth: a country's light is the same for any spin and any aim, the terminator fixed in the Earth's frame", () => {
    const at = noon("2026-11-12T09:30:00Z");
    const japan = new Vector3(...groundDirection({ latitude: 36 * DEGREE, longitude: 138 * DEGREE }));
    const light = (angle: number, group: Quaternion) =>
      worldOf(japan, angle, group).dot(worldSun({ epochMs: at, angle, group }, new Vector3()));
    const first = light(0, base);
    for (const [angle, tilt] of [
      [0.7, 0.2],
      [3, -0.6],
      [40, 1.1],
    ] as const) {
      const group = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt).multiply(base);
      expect(light(angle, group)).toBeCloseTo(first, 9);
    }
  });
});
