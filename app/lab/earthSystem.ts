// The Earth's system in the lab (part 7x): the site's Earth view (station/earthView.ts) with the home's Earth and Moon, at the view at rest
// ("earthsys") or the top view ("earthtop"), for Alexis's eye: `count` sample stations stand (gnosh.ai first), `size` sets gnosh.ai's;
// `scenery=off` leaves the planets out, for a frame's cost without them.
import { EARTH_PLACE, earthCamera, earthEye, earthTopEye, FIELD_OF_VIEW } from "@gnoworld/core";
import { Group, PerspectiveCamera, Scene } from "three";
import { Home } from "../src/scene/cosmos/home.ts";
import { EarthView } from "../src/scene/station/earthView.ts";
import { nameOf, scene, sizeOf, studyView } from "./earthParts.ts";
import { starField, starSprite } from "./sky.ts";
import type { Device, View } from "./views.ts";

export interface Asked {
  readonly top: boolean;
  readonly count: number;
  readonly size: number;
}

/** The Earth's system, from the view at rest or from above. */
export async function earthSystem({ renderer, base, ratio }: Device, { top, count, size }: Asked): Promise<View> {
  const stage = new Scene();
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1.6, 0.05, 6000);
  const eye = scene(top ? earthTopEye() : earthEye());
  const at = scene(EARTH_PLACE).sub(eye);
  stage.add(starField(ratio));
  camera.up.copy(scene({ x: 0, y: 1, z: 0 }).sub(scene({ x: 0, y: 0, z: 0 })));
  camera.lookAt(at);
  stage.add(starSprite(camera, scene({ x: 0, y: 0, z: 0 }).sub(eye).normalize()));
  const origin = new Group();
  stage.add(origin);
  const moved = () => undefined;
  const home = new Home({ renderer, stage, camera, halved: () => false, base, moved, stood: moved }, origin);
  home.stand();
  const plain = new URLSearchParams(location.search).get("scenery") === "off";
  const projects = Array.from({ length: count }, (_, index) => ({
    name: nameOf(index),
    url: "https://gno.land",
    size: sizeOf(index, size),
  }));
  const sight = { width: innerWidth, height: innerHeight, focal: 1 };
  const view = new EarthView(
    { renderer, base, moved, camera },
    { projects, document, sight: () => sight, scenery: !plain },
  );
  stage.add(view.group);
  view.stand();
  // The view is drawn once the Earth and the scenery stand.
  await new Promise<void>((done) => {
    const wait = () => {
      if (home.stood && (plain || view.stats().scenery > 0)) done();
      else setTimeout(wait, 50);
    };
    wait();
  });
  Reflect.set(globalThis, "__earthSystem", { ...view.stats(), camera: earthCamera() });
  return studyView(
    { stage, camera },
    {
      looked() {
        Object.assign(sight, {
          width: innerWidth,
          height: innerHeight,
          focal: innerHeight / (2 * Math.tan((FIELD_OF_VIEW * Math.PI) / 360)),
        });
        camera.updateMatrixWorld();
        view.tick(eye, 0, true);
      },
      tick(seconds) {
        home.tick(eye, seconds, camera.quaternion);
        view.tick(eye, seconds, true);
      },
      dispose() {
        home.drop();
        view.dispose();
      },
    },
  );
}
