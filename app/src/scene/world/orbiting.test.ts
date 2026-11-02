import { BufferGeometry, Object3D, ShaderMaterial, Texture, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitingMoons, type MoonMark, type MoonSight } from "./orbiting.ts";

// A world's rooms as moons, drawn (7e's review, A2b-3, 4 and 6): each on an orbit of its own, freed when it leaves, hidden behind the world
// and over the plate, its link under its disc, and casting from where it truly stands.
const maps = { map: () => new Texture(), clouds: new Texture(), ring: new Texture() };
const SUN = new Vector3(1, 0, 0);

const moonsOf = () => new OrbitingMoons(new BufferGeometry(), () => maps);
const mark = (room: string, size = 1) => {
  const places: [number, number, boolean][] = [];
  const moon: MoonMark = {
    room,
    size,
    place: (x, y, shown) => {
      places.push([x, y, shown]);
    },
  };
  return { moon, places };
};
// A plain lens: a world unit is 100 pixels, the world's centre at 500, 500.
const sight = (more: Partial<MoonSight> = {}): MoonSight => ({
  project: (at, into) => into.set(500 + at.x * 100, 500 - at.y * 100, at.z),
  words: -Infinity,
  world: new Object3D(),
  disc: 100,
  ...more,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a world's moons", () => {
  it("frees the moon of a room that leaves", () => {
    const moons = moonsOf();
    moons.set([mark("#a").moon, mark("#b").moon]);
    const freed = vi.spyOn(ShaderMaterial.prototype, "dispose");
    moons.set([mark("#b").moon]);
    expect(freed).toHaveBeenCalled();
    expect(moons.group.children).toHaveLength(1);
  });

  it("hides a moon behind the world, shows one in front, and stands its link under its disc", () => {
    const moons = moonsOf();
    const front = mark("#front");
    moons.set([front.moon]);
    const [moon] = moons.group.children;
    if (moon === undefined) throw new Error("no moon");
    moon.position.set(0.2, 0.1, 2);
    moon.scale.setScalar(0.2);
    moons.group.updateMatrixWorld(true);
    moons.pose(sight());
    expect(front.places.at(-1)).toEqual([520, 490 + 100 * 0.2, true]);
    moon.position.set(0.2, 0.1, -2);
    moons.group.updateMatrixWorld(true);
    moons.pose(sight());
    expect(front.places.at(-1)?.[2]).toBe(false);
    expect(moon.visible).toBe(false);
  });

  it("hides a moon over the plate's words", () => {
    const moons = moonsOf();
    const over = mark("#over");
    moons.set([over.moon]);
    const [moon] = moons.group.children;
    if (moon === undefined) throw new Error("no moon");
    moon.position.set(-3, 0, 1);
    moons.group.updateMatrixWorld(true);
    moons.pose(sight({ words: 250 }));
    expect(over.places.at(-1)?.[2]).toBe(false);
  });

  it("casts from where each moon stands in the stage's frame, at its size there", () => {
    const moons = moonsOf();
    moons.set([mark("#a").moon, mark("#b", 0.3).moon]);
    moons.group.position.set(0, 0, -5);
    moons.group.scale.setScalar(2);
    moons.tick(4, SUN);
    moons.group.updateMatrixWorld(true);
    moons.pose(sight());
    moons.group.children.forEach((child, at) => {
      const place = child.getWorldPosition(new Vector3());
      const caster = moons.casters[at];
      expect(caster?.x).toBeCloseTo(place.x, 9);
      expect(caster?.z).toBeCloseTo(place.z, 9);
      expect(caster?.w).toBeCloseTo(child.scale.x * 2, 9);
    });
  });
});
