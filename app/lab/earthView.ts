// The realism page's fifth view: the Earth itself, the very view the site stands on its plate, here on the page's black, so the worlds can be
// held against it. Its sun and its pose are the site's: at rest under reduced motion, coming round otherwise.
import { PerspectiveCamera, Scene, Vector2 } from "three";
import { EarthView } from "../src/scene/earth/view.ts";
import { starField } from "./sky.ts";
import type { Device, View } from "./views.ts";

// The site's lens.
const FIELD_OF_VIEW = 50;
const FRACTION = 0.33;

/** Builds the Earth, resolved once it is drawn. */
export async function earthView({ renderer, base, ratio }: Device): Promise<View> {
  const stage = new Scene();
  const stars = starField(ratio);
  stage.add(stars);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1.6, 0.1, 2000);
  const earth = new EarthView({
    renderer,
    stage,
    camera,
    halved: () => false,
    base,
    moved: () => undefined,
  });
  const size = new Vector2(800, 500);
  const circle = () => ({ x: size.x / 2, y: size.y / 2, radius: Math.min(size.x, size.y) * FRACTION });
  const said = (done: () => void, fail: (reason: Error) => void) => (state: string) => {
    if (state === "drawn") done();
    else if (state === "failed") fail(new Error("the Earth did not come"));
  };
  earth.resize(size.x, size.y, ratio);
  await new Promise<void>((done, fail) => {
    earth.show(circle(), said(done, fail));
  });
  return {
    stage,
    camera,
    worlds: [],
    textures: [],
    images: 0,
    targetBytes: 0,
    look(_eyeX, _eyeY, aspect) {
      renderer.getSize(size);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      earth.resize(size.x, size.y, ratio);
      earth.show(circle(), () => undefined);
    },
    tick: (seconds) => {
      earth.tick(seconds);
    },
    dispose() {
      earth.dispose();
      stars.geometry.dispose();
      stars.material.dispose();
    },
  };
}
