// The nebulae on the stage (ADR-0002 §10, "Space views"): an image's sheets in one draw (sheets.ts). A look stands the nebulae lit from the
// eye; a frame brings them to the eye in doubles and lights them. Their images come once the worlds' maps had their turn, and each fades
// in; near a world, and past a cluster's distance, they go out.
import {
  driftAt,
  focusDistance,
  glideAt,
  NEBULA_IMAGES,
  NEBULA_LAYERS,
  NebulaField,
  nebulaLight,
  nebulaShare,
  sheetOf,
  windowOf,
  type Point,
} from "@gnoworld/core";
import { Group } from "three";
import type { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import { Ahead } from "./ahead.ts";
import { BodyMaps } from "./maps.ts";
import { sheetsOf, type Sheets } from "./sheets.ts";

// The arrival's worlds ask their maps first: 0.6 MB of nebulae waits its turn.
const WAIT_MS = 2000;
// How far the scenery's eye goes before the nebulae are stood again around it: well inside the field's margin past its reach.
const PLACE_STEP = 40;
const FADE_SECONDS = 1;

export class Nebulae {
  readonly group = new Group();
  readonly #device: EarthDevice;
  readonly #gone: AbortSignal;
  readonly #maps: BodyMaps;
  readonly #ahead: Ahead;
  readonly #kept = new NebulaField();
  readonly #images: readonly Sheets[];
  readonly #at = { x: 0, y: 0, z: 0 };
  readonly #window = { u: 0, v: 0, width: 0, height: 0 };
  readonly #drift = { x: 0, y: 0, z: 0 };
  readonly #glide = { x: 0, y: 0, z: 0 };
  readonly #scenery = { x: 0, y: 0, z: 0 };
  readonly #placed = { x: NaN, y: NaN, z: NaN };
  #wait: ReturnType<typeof setTimeout> | undefined;
  #placing: ReturnType<typeof setTimeout> | undefined;
  #ready = false;
  #seconds = 0;
  #share = 0;

  constructor(device: EarthDevice, owner: Disposer) {
    this.#device = device;
    this.#gone = owner.signal;
    this.#maps = new BodyMaps(device, this.#came);
    this.#ahead = new Ahead(device, this.group, this.#came);
    this.#images = NEBULA_IMAGES.map(() => sheetsOf(owner));
    for (const { mesh } of this.#images) this.group.add(mesh);
    this.group.visible = false;
    owner.add({
      dispose: () => {
        this.sleep();
        clearTimeout(this.#placing);
        this.#maps.free();
        this.group.removeFromParent();
      },
    });
  }

  /** The cosmos shows: the program is compiled ahead, and the images may come once the worlds' had their turn. */
  wake(): void {
    this.group.visible = true;
    this.#ahead.ask();
    if (!this.#ready && this.#wait === undefined) this.#wait = setTimeout(this.#waited, WAIT_MS);
  }

  readonly #waited = (): void => {
    this.#wait = undefined;
    this.#ready = true;
    this.#came();
  };

  /** The cosmos is hidden: nothing shows, nothing is asked. */
  sleep(): void {
    this.group.visible = false;
    clearTimeout(this.#wait);
    this.#wait = undefined;
  }

  show(shown: boolean): void {
    if (shown) this.wake();
    else this.sleep();
  }

  /** A look: the nebulae lit from `eye`, each image's in its draw. */
  place(eye: Point): void {
    this.#kept.around(eye);
    for (const image of this.#images) image.count = 0;
    for (let at = 0; at < this.#kept.count; at += 1) this.#standAll(at, eye);
    for (const image of this.#images) {
      image.mesh.geometry.setDrawRange(0, image.count * 6);
      image.sheet.needsUpdate = true;
      image.window.needsUpdate = true;
      image.light.needsUpdate = true;
    }
    this.#came();
  }

  // A nebula lit from the eye, each of its layers: a short memory leaves the near one out.
  #standAll(at: number, eye: Point): void {
    const nebula = this.#kept.list[at];
    const image = this.#images[nebula?.image ?? -1];
    if (nebula === undefined || image === undefined || nebulaLight(nebula, eye) <= 0) return;
    const layers = this.#device.halved() ? NEBULA_LAYERS.length - 1 : NEBULA_LAYERS.length;
    for (let layer = 0; layer < layers; layer += 1) this.#stand(image, at, layer);
  }

  #stand(image: Sheets, at: number, layer: number): void {
    const nebula = this.#kept.list[at];
    const look = NEBULA_LAYERS[layer];
    if (nebula === undefined || look === undefined) return;
    const sheet = image.count;
    image.of[sheet] = at;
    image.layer[sheet] = layer;
    image.count += 1;
    const half = sheetOf(nebula, look, this.#at);
    windowOf(nebula, look, this.#window);
    const { u, v, width, height } = this.#window;
    for (let corner = sheet * 4; corner < sheet * 4 + 4; corner += 1) {
      image.sheet.setXYZW(corner, half, nebula.turn, look.blur, nebula.seed + layer * 7);
      image.window.setXYZW(corner, u, v, width, height);
      image.light.setXYZW(corner, nebula.red, nebula.green, nebula.blue, 0);
    }
  }

  // Something came, the program or an image, or the wait ended: each image a lit nebula needs is asked, and what is here shows. Once its
  // owner left, nothing: a compile that ends late would ask the freed images again.
  readonly #came = (): void => {
    if (this.#gone.aborted) return;
    for (const [at, image] of this.#images.entries()) {
      const name = NEBULA_IMAGES[at];
      const texture = this.#ready && image.count > 0 && name !== undefined ? this.#maps.named(name) : undefined;
      image.image.value = texture ?? null;
      image.mesh.visible = this.#ahead.done && texture !== undefined;
      if (texture === undefined) image.fade = 0;
    }
    this.#device.moved();
  };

  /** A frame of the cosmos, `eye` the worlds': the nebulae are scenery, so they stand around the scenery's eye, which adds the sky's
   * cruise (eye.ts), and take their share from how far the worlds' eye is from what it looks at. */
  follow(eye: Point, seconds: number): void {
    driftAt(this.#drift, seconds);
    glideAt(this.#glide, seconds);
    const at = this.#scenery;
    at.x = eye.x + this.#drift.x - this.#glide.x;
    at.y = eye.y + this.#drift.y - this.#glide.y;
    at.z = eye.z + this.#drift.z - this.#glide.z;
    const moved = Math.hypot(at.x - this.#placed.x, at.y - this.#placed.y, at.z - this.#placed.z);
    if (!(moved < PLACE_STEP) && this.#placing === undefined) this.#placing = setTimeout(this.#standAround);
    this.advance(at, nebulaShare(focusDistance(eye)), seconds);
  }

  // Off the frame: a look of its own, around where the scenery's eye has come.
  readonly #standAround = (): void => {
    this.#placing = undefined;
    this.#placed.x = this.#scenery.x;
    this.#placed.y = this.#scenery.y;
    this.#placed.z = this.#scenery.z;
    this.place(this.#placed);
  };

  /** A frame: each sheet from `eye`, lit by its distance, by `share` and by its image's fade, which a still clock completes at once. */
  advance(eye: Point, share: number, seconds: number): void {
    const step = seconds - this.#seconds;
    this.#seconds = seconds;
    this.#share = share;
    for (let at = 0; at < this.#images.length; at += 1) {
      const image = this.#images[at];
      if (!image?.mesh.visible) continue;
      image.fade = step > 0 ? Math.min(1, image.fade + step / FADE_SECONDS) : 1;
      for (let sheet = 0; sheet < image.count; sheet += 1) this.#light(image, sheet, eye);
      image.position.needsUpdate = true;
      image.light.needsUpdate = true;
    }
  }

  #light(image: Sheets, sheet: number, eye: Point): void {
    const nebula = this.#kept.list[image.of[sheet] ?? -1];
    const look = NEBULA_LAYERS[image.layer[sheet] ?? -1];
    if (nebula === undefined || look === undefined) return;
    sheetOf(nebula, look, this.#at);
    const light = nebulaLight(nebula, eye) * look.light * this.#share * image.fade;
    for (let corner = sheet * 4; corner < sheet * 4 + 4; corner += 1) {
      image.position.setXYZ(corner, this.#at.x - eye.x, this.#at.y - eye.y, this.#at.z - eye.z);
      image.light.setW(corner, light);
    }
  }

  /** Its images go: five minutes covered, or a context lost. They come again behind the worlds' maps, by themselves while it shows. */
  free(): void {
    this.#maps.free();
    this.#ready = false;
    clearTimeout(this.#wait);
    this.#wait = undefined;
    if (this.group.visible) this.wake();
    for (const image of this.#images) {
      image.image.value = null;
      image.mesh.visible = false;
      image.fade = 0;
    }
  }

  /** What shows, for the journeys: its lit sheets, and the images it holds. */
  stats(): { sheets: number; images: number } {
    const lit = (image: Sheets) =>
      Array.from({ length: image.count }, (_, sheet) => image.light.getW(sheet * 4)).filter((light) => light > 0)
        .length;
    const shown = this.#images.filter(({ mesh }) => this.group.visible && mesh.visible);
    return { sheets: shown.reduce((sum, image) => sum + lit(image), 0), images: this.#maps.size };
  }
}
