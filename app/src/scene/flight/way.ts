// A flight's way (7g). In the cosmos camera-controls swings a rig camera from one look to the next, round what each looks at, the way it
// turns ahead of the way it goes; the scene's camera stays at the origin, so the rig gives the eye's way and what it looks at. A page's
// flight goes straight along the view, its next body brought from afar, or comes back along it to the cosmos's view at rest.
import { type Point } from "@gnoworld/core";
import CameraControls from "camera-controls";
import {
  Box3,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from "three";

CameraControls.install({
  THREE: { Box3, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 },
});

/** How far a page's flight crosses, in world units. */
const PAGE_WAY = 60;
// How far a page's next body starts, as a share of where it stands at rest: a dot at first.
const FAR_BODY = 30;
const TURN = 2 * Math.PI;

/** Where an eye stands and what it looks at, on the stage, and which way is up there. */
export interface Look {
  readonly eye: Point;
  readonly look: Point;
  readonly up?: Point;
}

/** What a way writes: the eye's travel and look, how far the page's body stands, and the camera it goes along. */
export interface Ride {
  readonly eye: { readonly travel: { x: number; y: number; z: number }; look: Point | undefined };
  readonly arrival: { approach: number };
  readonly camera: PerspectiveCamera;
}

interface State {
  target: [number, number, number];
  spherical: [number, number, number];
}
const state = (): State => ({ target: [0, 0, 0], spherical: [1, 0, 0] });

export class Way {
  readonly #rig = new PerspectiveCamera();
  readonly #controls: CameraControls;
  readonly #upright = new Quaternion();
  readonly #y = new Vector3(0, 1, 0);
  readonly #from = state();
  readonly #to = state();
  readonly #origin = new Vector3();
  readonly #start = new Vector3();
  readonly #end = new Vector3();
  readonly #forward = new Vector3();
  readonly #look = new Vector3();
  readonly #spherical = new Spherical();
  readonly #offset = new Vector3();
  #kind: "arc" | "ahead" | "back" = "ahead";
  #lookAtEnd = false;

  constructor() {
    this.#controls = new CameraControls(this.#rig);
  }

  /** From `from` to `to` in the cosmos, the eye's travel `travel` when it starts; `keepLook`, whether the end looks at what `to` does. */
  arc(from: Look, to: Look, { travel, keepLook }: { readonly travel: Point; readonly keepLook: boolean }): void {
    this.#kind = "arc";
    this.#lookAtEnd = keepLook;
    // The rig turns about the up `from` gives, the map's, as the cosmos's camera does.
    if (from.up !== undefined) this.#rig.up.set(from.up.x, from.up.y, from.up.z);
    this.#controls.updateCameraUp();
    this.#upright.setFromUnitVectors(this.#rig.up, this.#y);
    this.#origin.set(from.eye.x, from.eye.y, from.eye.z);
    this.#start.set(travel.x, travel.y, travel.z);
    this.#end.set(to.eye.x - from.eye.x + travel.x, to.eye.y - from.eye.y + travel.y, to.eye.z - from.eye.z + travel.z);
    if (!keepLook) this.#end.set(0, 0, 0);
    this.#hold(from, this.#from);
    this.#hold(to, this.#to);
    // The short way round: camera-controls goes from one turn to the other the way the numbers lie.
    const [, , start] = this.#from.spherical;
    const [, , end] = this.#to.spherical;
    this.#to.spherical[2] = end + TURN * Math.round((start - end) / TURN);
  }

  #hold({ eye, look }: Look, into: State): void {
    this.#offset.set(eye.x - look.x, eye.y - look.y, eye.z - look.z).applyQuaternion(this.#upright);
    this.#spherical.setFromVector3(this.#offset);
    into.target[0] = look.x;
    into.target[1] = look.y;
    into.target[2] = look.z;
    into.spherical[0] = this.#spherical.radius;
    into.spherical[1] = this.#spherical.phi;
    into.spherical[2] = this.#spherical.theta;
  }

  /** Along the camera's view from the eye's travel `travel`: to a page's body (`ahead`), or back to the cosmos's view at rest. */
  straight(travel: Point, ahead: boolean, camera: PerspectiveCamera): void {
    this.#kind = ahead ? "ahead" : "back";
    this.#lookAtEnd = false;
    this.#start.set(travel.x, travel.y, travel.z);
    this.#forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (ahead) this.#end.copy(this.#forward).multiplyScalar(PAGE_WAY).add(this.#start);
    else this.#end.set(0, 0, 0);
  }

  /** The way's length, in world units. */
  get length(): number {
    return this.#kind === "back" ? PAGE_WAY : this.#end.distanceTo(this.#start);
  }

  /** Writes `ride` `by` along the way, 0 at its start and 1 at its end. */
  write(by: number, ride: Ride): void {
    const { travel } = ride.eye;
    if (this.#kind === "arc") {
      // It settles at once with no transition: what it promises is kept already.
      this.#controls.lerp(this.#from, this.#to, by).catch(reportError);
      this.#controls.update(0);
      const { position } = this.#rig;
      travel.x = this.#start.x + position.x - this.#origin.x;
      travel.y = this.#start.y + position.y - this.#origin.y;
      travel.z = this.#start.z + position.z - this.#origin.z;
      ride.eye.look = this.#controls.getTarget(this.#look, false);
      return;
    }
    if (this.#kind === "back") this.#forward.set(0, 0, -1).applyQuaternion(ride.camera.quaternion);
    const left = this.#kind === "back" ? -PAGE_WAY * (1 - by) : PAGE_WAY * by;
    const from = this.#kind === "back" ? this.#end : this.#start;
    travel.x = from.x + this.#forward.x * left;
    travel.y = from.y + this.#forward.y * left;
    travel.z = from.z + this.#forward.z * left;
    ride.arrival.approach = this.#kind === "ahead" ? 1 + (FAR_BODY - 1) * (1 - by) : 1;
  }

  /** Writes `ride` at the way's end, exactly. */
  end(ride: Ride): void {
    const { travel } = ride.eye;
    travel.x = this.#end.x;
    travel.y = this.#end.y;
    travel.z = this.#end.z;
    ride.eye.look = this.#lookAtEnd ? this.#look.fromArray(this.#to.target) : undefined;
    ride.arrival.approach = 1;
  }

  dispose(): void {
    this.#controls.dispose();
  }
}
