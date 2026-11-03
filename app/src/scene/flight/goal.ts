// What a flight is asked and what it says (7g): where it goes, what the panel shows of it, what it reads of the cosmos, and what the scene
// hands it.
import type { FlightPhase, onPlane, Point, StarSystem, toMap, toScene } from "@gnoworld/core";
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

/** What a flight reads of the cosmos while it shows: its systems, the eye it places and its Earth on the stage, and its ways between the
 * map, the stage and a system's plane, which the flights' chunk takes from it rather than share a module with it. */
export interface CosmosSight {
  readonly systems: () => readonly StarSystem[];
  readonly eye: Point;
  readonly earth: Point;
  /** How far from the eye, on the stage, the suns give a star its light: past it a star is empty space. */
  readonly lit: number;
  readonly toScene: typeof toScene;
  readonly toMap: typeof toMap;
  readonly onPlane: typeof onPlane;
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
  /** A flight, or its veil, needs the loop's full rate, or no more. */
  readonly busy: (flying: boolean) => void;
  readonly still: () => boolean;
  readonly cosmos: () => CosmosSight | undefined;
}
