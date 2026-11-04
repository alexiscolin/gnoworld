// The Earth's system in the lab (part 7x), for Alexis's eye before any product code: the Earth of the home with its Moon, the real planets
// as scenery, the stations each built from its name, at the home's view at rest ("earthsys") or zoomed down on the Earth ("earthtop").
// `count` stations stand (gnosh.ai first), `size` sets gnosh.ai's; `scenery=off` leaves the planets out, for a frame's cost without them.
import { EARTH_PLACE, FIELD_OF_VIEW } from "@gnoworld/core";
import { earthCamera, earthEye, sceneryOf, stationOf, stationsRound } from "@gnoworld/core";
import { Group, PerspectiveCamera, Scene, Vector2 } from "three";
import { Home } from "../src/scene/cosmos/home.ts";
import { SMALL_RING } from "../src/scene/earth/orbit.ts";
import { beltOf } from "../src/scene/station/belt.ts";
import { SceneryDrawn } from "../src/scene/station/scenery.ts";
import { StationsDrawn } from "../src/scene/station/stations.ts";
import { lightsOf, nameOf, namesOf, orbitsOf, scene, sizeOf, studyView } from "./earthParts.ts";
import { starField, starSprite } from "./sky.ts";
import type { Device, View } from "./views.ts";

// The stage, its camera at the origin looking at the Earth from the view at rest or from above, and the world's group round the Earth.
function staged(top: boolean, ratio: number) {
  const stage = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1.6, 0.05, 6000);
  const earth = scene(EARTH_PLACE);
  const eyeMap = top
    ? { x: EARTH_PLACE.x, y: EARTH_PLACE.y + 30 * Math.sin(1.25), z: EARTH_PLACE.z + 30 * Math.cos(1.25) }
    : earthEye();
  const eye = scene(eyeMap);
  const world = new Group();
  world.position.copy(earth).sub(eye);
  stage.add(starField(ratio), world);
  const up = scene({ x: 0, y: 1, z: 0 }).sub(scene({ x: 0, y: 0, z: 0 }));
  camera.up.copy(up);
  camera.lookAt(world.position);
  stage.add(starSprite(camera, scene({ x: 0, y: 0, z: 0 }).sub(eye).normalize()));
  world.add(...lightsOf(scene({ x: 0, y: 0, z: 0 }).sub(earth).normalize()));
  return { stage, camera, earth, eyeMap, eye, world, up };
}

export interface Asked {
  readonly top: boolean;
  readonly count: number;
  readonly size: number;
}

/** The Earth's system, from the view at rest or from above. */
export async function earthSystem({ renderer, base, ratio }: Device, { top, count, size }: Asked): Promise<View> {
  const { stage, camera, earth, eyeMap, eye, world, up } = staged(top, ratio);
  const origin = new Group();
  stage.add(origin);
  const home = new Home(
    { renderer, stage, camera, halved: () => false, base, moved: () => undefined, stood: () => undefined },
    origin,
  );
  home.stand();
  const asked = Array.from({ length: count }, (_, index) => ({ seed: nameOf(index), size: sizeOf(index, size) }));
  const round = stationsRound(asked, SMALL_RING);
  const stations = new StationsDrawn();
  stations.stand(
    round.close.map((placed) => ({
      station: stationOf(placed.seed, placed.size),
      at: scene(placed.place).sub(earth),
      radius: placed.radius,
    })),
  );
  world.add(stations.group);
  const beltPlaces = new Float32Array(round.belt.flatMap(({ place }) => scene(place).sub(earth).toArray()));
  const belt = beltOf(beltPlaces, new Float32Array(round.belt.map(({ radius }) => radius * 0.6)));
  world.add(belt);
  const orbits = top ? orbitsOf(round.close, earth) : undefined;
  if (orbits !== undefined) world.add(orbits);
  const scenery = new SceneryDrawn();
  const plain = new URLSearchParams(location.search).get("scenery") === "off";
  await scenery.stand(plain ? [] : sceneryOf(), {
    eye: eyeMap,
    base,
    anisotropy: Math.min(renderer.capabilities.getMaxAnisotropy(), 8),
  });
  world.add(scenery.group);
  // The Earth comes on its own: the view is drawn once it stands.
  await new Promise<void>((done) => {
    const wait = () => {
      if (home.stood) done();
      else setTimeout(wait, 50);
    };
    wait();
  });
  const names = namesOf(round.close, { eye, up });
  Reflect.set(globalThis, "__earthSystem", {
    close: round.close.map(({ seed, size: one }) => ({ seed, size: one })),
    belt: round.belt.length,
    parts: stations.stats(),
    camera: earthCamera(),
  });
  return studyView(
    { stage, camera },
    {
      looked() {
        const scale = belt.material.uniforms["scale"];
        if (scale !== undefined)
          scale.value =
            renderer.getDrawingBufferSize(new Vector2()).y / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360));
        names.place(camera);
      },
      tick(seconds) {
        home.tick(eye, seconds, camera.quaternion);
        stations.tick(seconds);
      },
      dispose() {
        home.drop();
        stations.dispose();
        scenery.dispose();
        belt.geometry.dispose();
        belt.material.dispose();
        orbits?.geometry.dispose();
        names.remove();
      },
    },
  );
}
