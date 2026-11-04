// The Earth's view's scenery drawn (part 7x): each real planet through the planets' one shader, as the Moon is, its map as it came, lit by
// the great star, with no label and no click. Its small maps load once the view is asked, never before. It owns its maps and spheres.
import { EARTH_PLACE, toScene, type Point } from "@gnoworld/core";
import { type Scenery } from "@gnoworld/core";
import { DataTexture, Group, RedFormat, SphereGeometry, Vector3, type Texture } from "three";
import { MOON } from "../earth/look.ts";
import { freeMap, loadMap, mapUrl, prepareMap } from "../planet/maps.ts";
import { createPlanet, type Planet } from "../planet/planet.ts";
import { sideOf } from "../cosmos/far.ts";

const SPHERE_WIDTH = 96;
const SPHERE_HEIGHT = 64;
// Saturn's ring's colour, a pale dust, over the ring's density map.
const RING_TINT = [0.82, 0.74, 0.6] as const;
// The star's angle from the eye at the most, for a planet: a third of its disc lit at the least, as a near body backlit would be black.
const SIDE_MOST = 1.9;

export interface SceneryDevice {
  /** Where the eye rests, on the map: each planet turns its day a little towards it, as every world does, never a black disc. */
  readonly eye: Point;
  readonly base: string;
  readonly anisotropy: number;
  readonly signal?: AbortSignal;
}

export class SceneryDrawn {
  readonly group = new Group();
  readonly #planets: Planet[] = [];
  readonly #maps: Texture[] = [];
  readonly #sphere = new SphereGeometry(1, SPHERE_WIDTH, SPHERE_HEIGHT);
  readonly #at = { x: 0, y: 0, z: 0 };
  readonly #sun = new Vector3();

  /** Loads each planet's map and stands it, round the Earth's place on the stage, which the group's origin is. */
  async stand(scenery: readonly Scenery[], { eye, base, anisotropy, signal }: SceneryDevice): Promise<void> {
    const none = prepareMap(new DataTexture(new Uint8Array([0]), 1, 1, RedFormat), "data", 1);
    none.needsUpdate = true;
    const ringed = scenery.some(({ ring }) => ring !== undefined);
    const ring = ringed
      ? await loadMap(mapUrl("ring", base), { kind: "data", anisotropy, ...(signal === undefined ? {} : { signal }) })
      : none;
    const surfaces = await Promise.all(
      scenery.map(({ map }) =>
        loadMap(mapUrl(map, base), { kind: "colour", anisotropy, ...(signal === undefined ? {} : { signal }) }),
      ),
    );
    this.#maps.push(none, ...surfaces, ...(ringed ? [ring] : []));
    toScene(EARTH_PLACE, this.#at);
    const earth = { ...this.#at };
    toScene(eye, this.#at);
    const seen = { x: this.#at.x - earth.x, y: this.#at.y - earth.y, z: this.#at.z - earth.z };
    scenery.forEach((planet, index) => {
      const surface = surfaces[index];
      if (surface !== undefined) this.#standOne(planet, surface, { none, ring, earth, seen });
    });
  }

  #standOne(
    { place, radius, tilt, ring: rings }: Scenery,
    surface: Texture,
    { none, ring, earth, seen }: { none: Texture; ring: Texture; earth: Point; seen: Point },
  ) {
    const look = {
      ...MOON,
      relief: 0,
      tilt,
      rings: rings === undefined ? null : { ...rings, tint: RING_TINT, opacity: 0.85 },
    };
    const planet = createPlanet(look, { map: () => surface, clouds: none, ring }, this.#sphere);
    toScene(place, this.#at);
    planet.group.position.set(this.#at.x - earth.x, this.#at.y - earth.y, this.#at.z - earth.z);
    planet.group.scale.setScalar(radius);
    planet.group.rotation.set(-0.35, 0, tilt);
    // Lit by the great star, at the map's centre.
    toScene({ x: 0, y: 0, z: 0 }, this.#at);
    this.#sun
      .set(this.#at.x - earth.x, this.#at.y - earth.y, this.#at.z - earth.z)
      .sub(planet.group.position)
      .normalize();
    const toEye = new Vector3(seen.x, seen.y, seen.z).sub(planet.group.position).normalize();
    planet.setSun(sideOf(this.#sun, toEye, Math.min(this.#sun.angleTo(toEye), SIDE_MOST)));
    this.#planets.push(planet);
    this.group.add(planet.group);
  }

  dispose(): void {
    for (const planet of this.#planets) planet.dispose();
    for (const map of this.#maps) freeMap(map);
    this.#sphere.dispose();
  }
}
