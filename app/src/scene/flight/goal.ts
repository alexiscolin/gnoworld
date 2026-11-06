// What a flight is asked and what it says (7g): where it goes, what the panel shows of it, what it reads of the cosmos, and what the scene
// hands it.
import type { FlightPhase, Point, StarSystem, toMap, toScene } from "@gnoworld/core";
import type { PerspectiveCamera, Scene as Stage, WebGLRenderer } from "three";
import type { Dissolve } from "../dissolve.ts";
import type { Eye } from "../eye.ts";

/** Where a flight goes: a star of the cosmos, back to its view at rest, or a page's place, its body or the cosmos. */
export type FlightGoal =
  | { readonly kind: "star"; readonly id: string }
  | { readonly kind: "rest" }
  | { readonly kind: "body"; readonly name: string }
  | { readonly kind: "cosmos"; readonly name: string };

/** What the panel shows of a flight under way. */
export interface FlightSaid {
  readonly target: string;
  readonly phase: FlightPhase;
  readonly distance: number;
  readonly speed: number;
  readonly eta: number;
  readonly along: number;
}

/** A system's arrival as a flight lands on it (7g2): the eye it places and what it looks at, on the stage. */
export interface Bound {
  readonly eye: Point;
  readonly look: Point;
}

/** What a flight asks of the arrivals the view at rest comes to (7g2): it is bound for one, whose drawing comes as the eye does, and
 * lands on it; or it leaves the one the eye rests at, the eye kept where it stands. */
export interface Arriving {
  /** Bound for the system `id`, or for none: its arrival's eye and look; none, for a star with no arrival or a chunk that does not come.
   * A later bind wins. */
  bind(id: string | undefined): Promise<Bound | undefined>;
  /** The next arrival hands the flight's eye over: the step left between the way's eye and the arrival's glides out. */
  handOver(): void;
  /** The next way back to the view at rest leaves the eye where it stands, the flight's travel carrying it there, and hands it over. */
  leave(): void;
  /** Whether the eye rests at a system's dynamic view, and what it looks at, on the stage. */
  readonly at: boolean;
  readonly looked: Point;
}

/** What a flight reads of the cosmos while it shows: its systems, the eye it places and its Earth on the stage, its ways between the map
 * and the stage, which the flights' chunk takes from it rather than share a module with it; and, once a file's view came, its arrivals. */
export interface CosmosSight {
  readonly systems: () => readonly StarSystem[];
  readonly eye: Point;
  readonly earth: Point;
  /** How far from the eye, on the stage, the suns give a star its light: past it a star is empty space. */
  readonly lit: number;
  readonly toScene: typeof toScene;
  readonly toMap: typeof toMap;
  arrival?: Arriving;
}

/** What the scene hands its flights: what a flight writes and draws with, the panel's ear and a frame owed; and where the views read the
 * approach this chunk writes, and the dive the dissolve it lends. */
export type FlightScene = Pick<FlightDevice, "renderer" | "stage" | "camera" | "eye"> & {
  readonly said: ((flight: FlightSaid | undefined) => void) | undefined;
  readonly moved: () => void;
  arrival?: FlightDevice["arrival"];
  veil?: (stage: Stage) => Dissolve;
};

export interface FlightDevice {
  readonly renderer: Pick<
    WebGLRenderer,
    "render" | "compileAsync" | "copyFramebufferToTexture" | "getDrawingBufferSize"
  >;
  readonly stage: Stage;
  readonly camera: PerspectiveCamera;
  /** The scene's eye: a flight writes its way and its look. */
  readonly eye: Pick<Eye, "travel" | "look">;
  /** How far the page's body stands, as a share of its place at rest, and how far to its side, as a share of its distance. */
  readonly arrival: { approach: number; aside: number };
  readonly said: (flight: FlightSaid | undefined) => void;
  /** A frame is owed: a flight starts, and the scene reads its busy from then on. */
  readonly moved: () => void;
  readonly still: () => boolean;
  readonly cosmos: () => CosmosSight | undefined;
  /** The scene's arrival at the system `id`, or back to the view at rest with none, as the page is told it (7g2). */
  readonly arrive: (id: string | undefined) => void;
}
