// The flights (7g; ADR-0001 §7, "travel like a ship"; ADR-0002 §1, "Flight panel"): the jump to a star the reader aims at, the way back to
// the view at rest, a page's flight with its body brought from afar; Escape or a click lands at once, and under reduced motion each is a
// crossfade. Their own chunk, with camera-controls, asked once the scene runs. The camera stays at the origin: a flight writes the eye's way,
// what it looks at and how far the page's body stands, and the panel hears it ten times a second at most.
import { ENTERS, figuresOf, FLIGHT, flightSeconds, phaseOf, wayAt } from "@gnoworld/core";
import { Vector2 } from "three";
import { Dissolve, veilAhead } from "../dissolve.ts";
import type { FlightDevice, FlightGoal, FlightSaid } from "./goal.ts";
import { listen } from "./keys.ts";
import { planWay } from "./plan.ts";
import { Streaks } from "./streaks.ts";
import { Way } from "./way.ts";

// The longest a flight waits for its page's body, and the longest frame it reads, in seconds; how often the panel hears it.
const WAIT = 2;
const LONGEST_FRAME = 0.25;
const SAID_EVERY = 0.1;
// A page's flight lays the frame it leaves over the next, gone by this far along, and grown by this much as the eye goes through it: a
// quarter, so the next body coming in is seen whole (the design review, F3706).
const VEIL_UNTIL = 0.25;
const VEIL_ZOOM = 0.6;

export class Flights {
  readonly #device: FlightDevice;
  readonly #leaving = new AbortController();
  readonly #streaks = new Streaks();
  readonly #ahead = veilAhead();
  readonly #size = new Vector2();
  readonly #way: Way;
  readonly #was = { x: 0, y: 0, z: 0 };
  readonly #moved = { x: 0, y: 0, z: 0 };
  readonly #flight = { distance: 0, seconds: 0 };
  readonly #said: { -readonly [K in keyof FlightSaid]: FlightSaid[K] } = {
    target: "",
    phase: "leaving",
    distance: 0,
    speed: 0,
    eta: 0,
    along: 0,
  };
  #kind: FlightGoal["kind"] = "rest";
  #flying = false;
  #still = false;
  #ready = true;
  #along = 1;
  #elapsed = 0;
  #waited = 0;
  #heard = 0;
  #flights = 0;
  #veil: Dissolve | undefined;
  #veiled = 0;
  // Whether the cosmos showed at the last frame.
  #cosmos = false;

  constructor(device: FlightDevice) {
    this.#device = device;
    this.#way = new Way();
    device.stage.add(this.#streaks.mesh, this.#ahead);
    // Compiled ahead, each shown for the call alone, for three compiles what is visible (WebGLRenderer.compile walks traverseVisible); a
    // compile that fails ahead is said, and leaves the first crossing to compile it.
    for (const mesh of [this.#streaks.mesh, this.#ahead]) {
      mesh.visible = true;
      device.renderer.compileAsync(mesh, device.camera, device.stage).catch(reportError);
      mesh.visible = false;
    }
    listen(this, device, this.#leaving.signal);
  }

  /** Flies to `goal`, from wherever the eye is: a goal it cannot reach starts nothing. */
  fly(goal: FlightGoal): void {
    const target = this.#leaving.signal.aborted ? undefined : planWay(goal, this.#device, this.#way);
    if (target === undefined) return;
    this.#said.target = target;
    this.#flight.distance = this.#way.length;
    this.#dropVeil();
    this.#still = this.#device.still();
    if (this.#still || goal.kind === "body" || goal.kind === "cosmos") this.#veil = this.#copy();
    this.#veil?.fade(1);
    this.#veiled = 0;
    const { eye } = this.#device;
    this.#kind = goal.kind;
    this.#flying = true;
    this.#ready = goal.kind !== "body";
    this.#flight.seconds = this.#still ? 0 : flightSeconds(this.#flight.distance);
    [this.#along, this.#elapsed, this.#waited, this.#heard] = [0, 0, 0, -SAID_EVERY];
    this.#flights += 1;
    this.#was.x = eye.travel.x;
    this.#was.y = eye.travel.y;
    this.#was.z = eye.travel.z;
    this.#device.moved();
    this.#sayOn(0);
  }

  // The frame drawn now, copied before the place it shows goes: a page's flight starts as the next page is shown, its last frame still
  // the one before.
  #copy(): Dissolve {
    const { renderer, stage, camera } = this.#device;
    const copy = new Dissolve(stage);
    renderer.render(stage, camera);
    return copy;
  }

  /** The page's body is drawn: a flight that waits for it may enter orbit. */
  ready(): void {
    this.#ready = true;
  }

  /** One frame on, `delta` ms after the last, before the eye advances. */
  advance(delta: number): void {
    this.#homeIfBack();
    const seconds = delta > 0 ? Math.min(delta / 1000, LONGEST_FRAME) : 0;
    if (this.#flying) this.#onWay(seconds);
    this.#fadeVeil(seconds);
  }

  // The cosmos shown again with no flight bringing it, past a page with no space: the eye stands at the home's view, not where the last
  // flight left it, 60 units past it after a page's (lot B's review, F3705).
  #homeIfBack(): void {
    const shown = this.#device.cosmos() !== undefined;
    if (shown && !this.#cosmos && !this.#flying) {
      const { eye } = this.#device;
      eye.travel.x = 0;
      eye.travel.y = 0;
      eye.travel.z = 0;
      eye.look = undefined;
    }
    this.#cosmos = shown;
  }

  #onWay(seconds: number): void {
    const { seconds: planned } = this.#flight;
    this.#elapsed += seconds;
    if (!this.#ready && this.#elapsed > ENTERS * planned) {
      this.#waited += this.#elapsed - ENTERS * planned;
      this.#elapsed = ENTERS * planned;
      this.#ready = this.#waited >= WAIT;
    }
    this.#along = planned > 0 ? Math.min(this.#elapsed / planned, 1) : 1;
    if (this.#along === 1) {
      this.#land();
      return;
    }
    const { travel } = this.#device.eye;
    this.#way.write(wayAt(this.#along), this.#device);
    this.#moved.x = travel.x - this.#was.x;
    this.#moved.y = travel.y - this.#was.y;
    this.#moved.z = travel.z - this.#was.z;
    this.#was.x = travel.x;
    this.#was.y = travel.y;
    this.#was.z = travel.z;
    this.#streaks.pixel(this.#device.renderer.getDrawingBufferSize(this.#size));
    this.#streaks.follow(travel, this.#moved, seconds);
    this.#sayOn(this.#along);
  }

  // The panel hears each change of phase, and the instruments ten times a second.
  #sayOn(along: number): void {
    if (this.#still) return;
    const phase = phaseOf(along);
    // On a beat of a tenth of a second from its start, which frames of a sixtieth do not drift off.
    if (phase === this.#said.phase && this.#elapsed < this.#heard + SAID_EVERY - 1e-9) return;
    this.#heard = Math.max(this.#heard + SAID_EVERY, this.#elapsed - SAID_EVERY);
    figuresOf(this.#flight, along, this.#said);
    this.#said.phase = phase;
    this.#said.along = along;
    this.#device.said(this.#said);
  }

  #fadeVeil(seconds: number): void {
    const veil = this.#veil;
    if (veil === undefined) return;
    this.#veiled += seconds;
    if (this.#still) veil.fade(1 - this.#veiled / FLIGHT.crossfade);
    else veil.fade(1 - this.#along / VEIL_UNTIL, 1 + VEIL_ZOOM * wayAt(this.#along));
    if (veil.veil > 0) return;
    this.#dropVeil();
  }

  #dropVeil(): void {
    this.#veil?.dispose();
    this.#veil = undefined;
  }

  /** Lands the flight under way at once, where it would have ended. */
  land(): void {
    if (this.#flying) this.#land();
  }

  #land(): void {
    this.#way.end(this.#device);
    this.#flying = false;
    this.#along = 1;
    this.#streaks.hide();
    if (!this.#still) this.#dropVeil();
    this.#device.said(undefined);
  }

  /** Whether a flight is under way. */
  get flying(): boolean {
    return this.#flying;
  }

  /** Whether a flight or its veil runs: the scene holds its loop's full rate for them. */
  get busy(): boolean {
    return this.#flying || this.#veil !== undefined;
  }

  dispose(): void {
    this.#leaving.abort();
    this.#dropVeil();
    this.land();
    this.#streaks.dispose();
    this.#ahead.removeFromParent();
    this.#ahead.geometry.dispose();
    this.#ahead.material.dispose();
    this.#way.dispose();
  }

  /** What it does, for the journeys. */
  stats() {
    const { travel } = this.#device.eye;
    return {
      flights: this.#flights,
      flying: this.#flying,
      along: this.#along,
      veil: this.#veil?.veil ?? 0,
      streaks: this.#streaks.shown,
      kind: this.#kind,
      target: this.#said.target,
      seconds: this.#flight.seconds,
      waited: this.#waited,
      travel: { x: travel.x, y: travel.y, z: travel.z },
    };
  }
}
