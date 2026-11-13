import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { EARTH } from "@gnoworld/core";
import { SPIN } from "../planet/surfaceShader.ts";
import { Bones } from "./bones.ts";

const system = {
  place: { x: 0, y: 0, z: 0 },
  across: { x: 1, y: 0, z: 0 },
  along: { x: 0, y: 0, z: 1 },
  reach: 1,
  planets: [],
};
const planet = { index: 0, id: EARTH, radius: 1, orbit: 0, phase: 0, speed: 0, system } as never;
const at = { x: 0, y: 0, z: 0 };

describe("a skeleton", () => {
  const stand = (bones: Bones, turn?: { leaned: Quaternion; ahead: number }) => {
    bones.begin();
    bones.show(planet, { at, seconds: 10, opacity: 1, ...turn });
    bones.end();
    const root = bones.group.children[0];
    return { root: root?.quaternion.clone(), spin: root?.children[0]?.rotation.y };
  };

  it("keeps the planet's own orientation: its lean and its spin lead turn it as they turn the planet", () => {
    const bones = new Bones();
    const rest = stand(bones);
    const same = stand(bones, { leaned: new Quaternion(), ahead: 0 });
    expect(same.root?.angleTo(rest.root ?? new Quaternion())).toBeCloseTo(0, 6);
    const leaned = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
    const turned = stand(bones, { leaned, ahead: 2 });
    expect(turned.root?.angleTo(rest.root ?? new Quaternion())).toBeCloseTo(0.3, 6);
    expect(turned.spin).toBeCloseTo(-(10 + 2) * SPIN, 9);
  });
});
