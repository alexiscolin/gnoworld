// What the universe's stage holds (D401): the planets, the suns, the dust, the stars, the galaxy's body (drawn over the frame), the orbits
// of the system the camera is in, the plate, the planets near enough to be themselves, and the speed and the scan; each made once per
// worlds' file, all disposed together.
import { Scene, type PerspectiveCamera, type WebGLRenderer } from "three";
import { Disposer } from "./disposer.ts";
import type { Universe } from "./layout.ts";
import { nebulaOf } from "./parts/nebula.ts";
import { dustOf, starsOf, sunsOf, type Suns } from "./parts/lights.ts";
import { Maps } from "./parts/maps.ts";
import { EarthGround } from "./earth/ground.ts";
import { Links } from "./parts/links.ts";
import { Orbits, Plate, Round } from "./parts/marks.ts";
import { Moons } from "./parts/moons.ts";
import { Near } from "./parts/near.ts";
import { Planets } from "./parts/planets.ts";
import { Sky } from "./parts/sky.ts";
import { Effects } from "./rig/effects.ts";
import { worldOf } from "./planet/generated.ts";

/** What every material of the stage reads each frame. */
export interface Frame {
  readonly uTime: { value: number };
  readonly uPxK: { value: number };
  readonly uProj: { value: number };
  /** The page's planet, by its index (-1 none), and how far the others have gone (0 to 1). */
  readonly uAlone: { value: number };
  readonly uSolo: { value: number };
  /** How large on screen, in pixels, the others must stand to shrink away (0: all of them, a page's); the home's keeps far worlds (D499). */
  readonly uSoloPx: { value: number };
  /** How much larger the home system's worlds are drawn on the home's first screen (1 elsewhere), eased by the frame (D541). */
  readonly uBoost: { value: number };
  /** How far a lens dims what it does not light (0 to 1), eased by the frame (D425). */
  readonly uLens: { value: number };
  /** 1 while the frame goes through the flight's blur pass, which grades it anew: a sun's glow is drawn ungraded then (D497). */
  readonly uThrough: { value: number };
}

export interface Gains {
  readonly sun: { value: number };
  readonly dust: { value: number };
  readonly stars: { value: number };
}

export class Stage {
  readonly scene = new Scene();
  readonly owner = new Disposer();
  readonly frame: Frame = {
    uTime: { value: 0 },
    uPxK: { value: 0.001 },
    uProj: { value: 1000 },
    uAlone: { value: -1 },
    uSolo: { value: 0 },
    uSoloPx: { value: 0 },
    uBoost: { value: 1 },
    uLens: { value: 0 },
    uThrough: { value: 0 },
  };
  readonly gains: Gains = { sun: { value: 1 }, dust: { value: 1 }, stars: { value: 1 } };
  readonly orbits = new Orbits();
  readonly plate = new Plate();
  /** The orbit round a planet a page frames close (D458). */
  readonly round = new Round();
  /** The moons round a planet a page frames close (D463). */
  readonly moons: Moons;
  /** The links between worlds, while the Map shows a system or a world (D433). */
  readonly links = new Links(this.frame.uLens);
  /** The Earth's ground, where the page's signs stand. */
  readonly ground: EarthGround;
  readonly maps: Maps;
  readonly effects: Effects;
  /** The galaxy's body, drawn over the frame (none in the chat's small view). */
  readonly sky: Sky | undefined;
  planets: Planets | undefined;
  suns: Suns | undefined;
  near: Near | undefined;
  readonly #made: { dispose(): void }[] = [];

  readonly #bare: boolean;

  /** For a site served at `base`; `still` under reduced motion; `bare`, no sky: no far stars, no dust, no galaxy's body. */
  constructor({ base, still, bare = false }: { base: string; still: () => boolean; bare?: boolean | undefined }) {
    this.#bare = bare;
    this.ground = new EarthGround((id) => worldOf(id).look, still);
    this.maps = this.owner.add(new Maps(base));
    this.moons = new Moons(this.maps, this.round.lines);
    this.effects = new Effects(this.scene, this.owner, still);
    if (!bare)
      this.scene.add(
        nebulaOf({ uGain: this.gains.stars, uThrough: this.frame.uThrough }),
        starsOf({ ...this.frame, uGain: this.gains.stars }),
      );
    const { uLens: lens, uProj: proj, uPxK: pxK } = this.frame;
    this.sky = bare ? undefined : this.owner.add(new Sky({ ...this.gains, lens, proj, pxK }));
    this.scene.add(this.orbits.lines, this.links.lines, this.plate.mesh, this.round.lines, this.moons.group);
    this.owner.add(this.orbits);
    this.owner.add(this.round);
    this.owner.add(this.moons);
    this.owner.add(this.links);
    this.owner.add(this.plate);
  }

  /** Stands `universe` on the stage, in place of the last. */
  stand(universe: Universe, { renderer, camera }: { renderer: WebGLRenderer; camera: PerspectiveCamera }): void {
    this.#clear();
    this.sky?.stand(universe);
    const planets = new Planets(universe, { ...this.frame });
    const suns = sunsOf(universe, { ...this.frame, uGain: this.gains.sun });
    this.suns = suns;
    const dust = this.#bare ? undefined : dustOf(universe, { ...this.frame, uGain: this.gains.dust });
    this.scene.add(planets.mesh, suns.mesh, ...(dust === undefined ? [] : [dust]));
    this.planets = planets;
    this.moons.use({ renderer, camera, scene: this.scene });
    const device = {
      stage: this.scene,
      renderer,
      camera,
      maps: this.maps,
      planets,
      plate: this.plate.mask,
      lens: this.frame.uLens,
    };
    this.near = new Near(device);
    this.#made.push(planets, this.near, {
      dispose: () => {
        this.scene.remove(planets.mesh, suns.mesh, ...(dust === undefined ? [] : [dust]));
        for (const mesh of dust === undefined ? [suns.mesh] : [suns.mesh, dust]) {
          mesh.geometry.dispose();
          (mesh.material as { dispose(): void }).dispose();
        }
      },
    });
  }

  /** Lights the planets and the suns of the worlds `only` names, the near ones drawn as themselves lit alone (D425); none, all. */
  light(universe: Universe, only: ReadonlySet<string> | undefined): void {
    if (this.near !== undefined) this.near.only = only;
    const lit = (planet: { readonly id: string } | undefined) => only?.has(planet?.id ?? "") === true;
    this.planets?.light(only === undefined ? undefined : (index) => lit(universe.planets[index]));
    this.suns?.light(only === undefined ? undefined : (index) => universe.systems[index]?.planets.some(lit) === true);
  }

  #clear(): void {
    for (const made of this.#made.splice(0)) made.dispose();
    this.planets = undefined;
    this.suns = undefined;
    this.near = undefined;
  }

  dispose(): void {
    this.#clear();
    this.owner.dispose();
  }
}
