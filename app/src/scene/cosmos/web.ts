// The whole cosmos on the stage (ADR-0002 §10; 7u, Alexis, 2026-11-04 night), a chunk of its own: past a cluster's distance one mass round
// the Earth, every world and realm a small solid sphere, each namespace a clump with its dust (core's mass), one draw; the liveliest clump
// lit, with three rings and a line of light; the biggest clumps' names in the cosmos's pills. A new set glides from the last one's places.
import {
  CENTRE,
  DISC_TILT,
  EARTH_PLACE,
  MASS,
  massOf,
  smoothstep,
  type ClearBox,
  type Mass,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { BufferAttribute, BufferGeometry, Color, Group, Points, Vector3, type Camera } from "three";
import { universeOf, type Universe } from "../live.ts";
import { offTheBox } from "../offTheBox.ts";
import { TextBox } from "../station/textBox.ts";
import type { CosmosWorld } from "./cosmosWorld.ts";
import { glideFrom, livelyOf, namespacesOf, paletteOf, screenOf, type WebPalette } from "./webHeld.ts";
import { WebLine } from "./webLine.ts";
import { groundOf, massLook, massUniforms } from "./webLook.ts";
import type { WebNames } from "./webNames.ts";
import { WebRings } from "./webRings.ts";

/** A set to stand: its systems as the cosmos placed them, its worlds as the file holds them, and the file's time. */
export interface WebSet {
  readonly systems: readonly StarSystem[];
  readonly worlds: readonly CosmosWorld[];
  readonly written: string | undefined;
}

/** Where a look stands: the eye on the map, its lens in pixels, and how far it is from what it looks at. */
export interface WebView {
  readonly eye: Point;
  readonly focal: number;
  readonly focus: number;
}

const GLIDE_SECONDS = 1.6;

export class Web {
  readonly group = new Group();
  readonly #mass = new Group();
  readonly #uniforms = massUniforms();
  readonly #ratio = this.#uniforms.uRatio;
  readonly #share = this.#uniforms.uShare;
  readonly #ground = this.#uniforms.uGround;
  readonly #tone = { value: new Color() };
  readonly #look = massLook(this.#uniforms);
  readonly #line = new WebLine(this.#tone);
  readonly #groundMesh = groundOf({ uGround: this.#ground, uShare: this.#share });
  readonly #rings = new WebRings();
  #names: WebNames | undefined;
  #named = false;
  #gone = false;
  readonly #page: Document | undefined;
  #laid: Mass | undefined;
  #points: Points | undefined;
  #universe: Universe = { calls: 0, newest: null, written: undefined };
  #worlds: readonly CosmosWorld[] = [];
  #glideFrom = Number.NaN;
  #chosen = -1;
  #camera: Camera | undefined;
  #count = 0;
  #box: () => ClearBox | undefined;
  readonly #at = new Vector3();

  /** Seen through `camera`, on `page`, whose tokens paint it and which holds its names; with none, a grey mass and no names. */
  constructor({
    camera,
    page,
    box,
  }: { camera?: Camera | undefined; page?: Document | undefined; box?: () => ClearBox | undefined } = {}) {
    // The hero's box and, on a phone, the list of worlds under it, as the Earth's view keeps them (7x2's TextBox).
    const text = new TextBox();
    this.#box = page === undefined ? () => box?.() : () => text.of(box?.());
    offTheBox(this.#look, this.#box, "thin");
    for (const look of [this.#line.mesh.material, this.#rings.look]) offTheBox(look, this.#box);
    this.#page = page;
    this.#camera = camera;
    this.group.name = "web";
    this.group.rotation.x = DISC_TILT;
    this.group.visible = false;
    this.#mass.position.set(EARTH_PLACE.x, EARTH_PLACE.y, EARTH_PLACE.z);
    this.#mass.add(this.#rings.group);
    this.group.add(this.#groundMesh, this.#mass, this.#line.mesh);
    this.paint(paletteOf(page?.documentElement));
    // The workshop's palettes, in the lab alone (tuning.ts's switch): the lab paints the mass it finds here.
    if (import.meta.env.GNOWORLD_TUNING === "1") Reflect.set(globalThis, "__gnoworldWeb", this);
  }

  /** Paints the mass with `palette`: its ground, kinds, chosen tone and light. */
  paint(palette: WebPalette): void {
    this.#ground.value.copy(palette.ground);
    this.#tone.value.copy(palette.tone);
    this.#uniforms.uKind.value = [...palette.kinds];
    this.#uniforms.uTouch.value = [...palette.touches];
    this.#uniforms.uTouchShare.value = palette.touch;
    this.#uniforms.uShadow.value = palette.shadow;
    this.#uniforms.uFarLight.value = palette.farLight;
    this.#rings.paint(palette.tone);
  }

  /** Stands a set at `now`: one mass of its worlds, gliding from where the last one held each particle, a new one growing from nothing. */
  stand({ worlds, written }: WebSet, now: number): void {
    const last = this.#laid;
    this.#worlds = worlds;
    this.#universe = universeOf(written === undefined ? { worlds } : { worlds, updated: written });
    const laid = massOf(namespacesOf(worlds, written));
    this.#laid = laid;
    this.#count = laid.clumps.reduce((sum, clump) => sum + clump.worlds, 0);
    this.#build(laid, last);
    this.#names?.stand(laid.clumps);
    this.#name();
    this.#choose(now);
  }

  #build(laid: Mass, last: Mass | undefined): void {
    this.#points?.geometry.dispose();
    this.#points?.removeFromParent();
    const [from, sizes] = [glideFrom(laid, last), new Float32Array(laid.sizes)];
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(laid.positions, 3));
    geometry.setAttribute("aFrom", new BufferAttribute(from, 3));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 3));
    geometry.setAttribute("aClump", new BufferAttribute(laid.owners, 1));
    const points = new Points(geometry, this.#look);
    points.frustumCulled = false;
    this.#points = points;
    this.#mass.add(points);
    const still = this.#page?.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? true;
    this.#glideFrom = last === undefined || still ? Number.NaN : Number.POSITIVE_INFINITY;
    this.#uniforms.uGlide.value = Number.isNaN(this.#glideFrom) ? 1 : 0;
  }

  // The clump that holds the most live worlds now, or else the most used: lit, ringed and crossed by the line of light.
  #choose(now: number): void {
    const clumps = this.#laid?.clumps ?? [];
    const best = livelyOf(clumps, this.#worlds, { universe: this.#universe, now });
    this.#chosen = best;
    this.#uniforms.uChosen.value = best;
    this.#rings.stand(clumps[best]);
  }

  /** A look at `now`: the chosen clump again, as its worlds' runs end; the depth its light falls over, the line and the names, where the
   * camera sees them now. */
  look(_view: WebView, now: number): void {
    this.#choose(now);
    const camera = this.#camera;
    const clump = this.#laid?.clumps[this.#chosen];
    if (camera === undefined) return;
    this.group.updateMatrixWorld();
    const screen = screenOf(this.#page);
    const from = this.#mass.getWorldPosition(this.#at).distanceTo(camera.position);
    this.#uniforms.uHalfHeight.value = screen.height / 2;
    this.#uniforms.uNear.value = Math.max(1, from - MASS.reach);
    this.#uniforms.uFar.value = from + MASS.reach;
    const project = (at: Point) => new Vector3(at.x, at.y, at.z).applyMatrix4(this.#mass.matrixWorld).project(camera);
    if (clump !== undefined) {
      const ndc = project(clump.landmark);
      this.#line.stand(ndc.x, ndc.y, screen);
    }
    this.#names?.place(project, { ...screen, box: this.#box() });
  }

  resize(ratio: number): void {
    this.#ratio.value = ratio;
  }

  /** A frame: the disc brought to `eye` on the stage, the glide on, how much of the view is the whole cosmos's, the line and the names. */
  advance(eye: Point, seconds: number, share: number): void {
    this.group.position.set(CENTRE.x - eye.x, CENTRE.y - eye.y, CENTRE.z - eye.z);
    if (this.#glideFrom === Number.POSITIVE_INFINITY) this.#glideFrom = seconds;
    if (!Number.isNaN(this.#glideFrom))
      this.#uniforms.uGlide.value = smoothstep(0, GLIDE_SECONDS, seconds - this.#glideFrom);
    this.#share.value = share;
    this.group.visible = share > 0 && this.#count > 0;
    this.#line.light(this.#chosen >= 0 && this.#camera !== undefined ? share : 0);
    this.#names?.show(share > 0.5 && this.#camera !== undefined);
  }

  // The pills come in a late chunk of their own, asked once a mass stands on a page (the chief, 2026-11-05).
  #name(): void {
    const page = this.#page;
    if (this.#named || page === undefined) return;
    this.#named = true;
    import("./webNames.ts")
      .then(({ WebNames: Loaded }) => {
        if (this.#gone) return;
        this.#names = new Loaded(page);
        if (this.#laid !== undefined) this.#names.stand(this.#laid.clumps);
      })
      .catch(reportError);
  }

  /** How many worlds it draws. */
  get count(): number {
    return this.#count;
  }

  /** What stands, for the journeys. */
  stats() {
    const laid = this.#laid;
    return {
      points: this.count,
      particles: laid?.keys.length ?? 0,
      clumps: laid?.clumps.length ?? 0,
      chosen: laid?.clumps[this.#chosen]?.id,
      share: this.#share.value,
    };
  }

  dispose(): void {
    this.#points?.geometry.dispose();
    this.#look.dispose();
    this.#line.dispose();
    this.#groundMesh.geometry.dispose();
    this.#groundMesh.material.dispose();
    this.#rings.dispose();
    this.#gone = true;
    this.#names?.dispose();
    this.group.removeFromParent();
  }
}
