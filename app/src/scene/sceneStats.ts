// What the scene shows the page: its door, and what it says of itself for `?debug` and the journeys.
import type { ClearBox, Point, Tier } from "@gnoworld/core";
import type { WebGLRenderer } from "three";
import type { Cosmos } from "./cosmos/cosmos.ts";
import type { CosmosWorld, LabelSignals } from "./cosmos/cosmosWorld.ts";
import type { Ground } from "./earth/marks.ts";
import type { Circle, EarthState, EarthView } from "./earth/view.ts";
import type { MoonMark, WorldAsk, WorldSaid } from "./world/part.ts";
import type { WorldStats } from "./world/view.ts";
import type { FlightGoal, FlightSaid, Flights } from "./flight/flights.ts";

export interface SceneOptions {
  readonly canvas: HTMLCanvasElement;
  /** The tier this device was found at before, if any. */
  readonly remembered: Tier | undefined;
  readonly remember: () => void;
  /** The context went (true), or came back (false). */
  readonly onLost: (lost: boolean) => void;
  /** What the flight panel shows of a flight under way, ten times a second at most; nothing once it landed (7g). */
  readonly onFlight?: (flight: FlightSaid | undefined) => void;
}

export interface Scene {
  cover(covered: boolean): void;
  /** Flies to a star of the cosmos, back to its view at rest, or to the place a page shows next, before the page changes it (7g). */
  fly(goal: FlightGoal): void;
  /** Where the view rests, in world units of any size. */
  moveTo(to: Point): void;
  /** Stands the Earth in `place`, or takes it away, and says how it goes. */
  earth(place: Circle | undefined, said: (state: EarthState) => void): void;
  /** The ground the page's signs stand on. */
  readonly ground: Ground;
  /** Stands the world a world's page asks for in its circle, or takes it away, and says how it goes. */
  world(asked: WorldAsk | undefined, said: WorldSaid): void;
  /** The rooms' moons the page keeps links for. */
  worldMoons(marks: readonly MoonMark[]): void;
  /** Stands these worlds and the fixed places, or takes them away; `written`, the file's time, ages their calls; `signals`, what is known
   * of them now, labels them (7h). */
  cosmos(worlds: readonly CosmosWorld[] | undefined, written?: string, signals?: LabelSignals): void;
  /** The box of the page's text, in its pixels: no body stands under it. */
  keepClear(box: ClearBox | undefined): void;
  /** Comes to the system named `id`, its postcard at its arrival, or back to the view at rest with none (7d3). */
  arrive(id: string | undefined): void;
  /** Portraits of the worlds `ids` for the rail (7i), `size` page pixels a side, drawn in frames of its own, by their ids. */
  portraits(ids: readonly string[], size: number, signal: AbortSignal): Promise<ReadonlyMap<string, string>>;
  dispose(): void;
  stats(): SceneStats;
}

export interface SceneStats {
  readonly frames: number;
  readonly tier: Tier;
  readonly ratio: number;
  readonly probing: boolean;
  readonly calls: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly eye: Point;
  /** How the eye looks about, and its clock, which reduced motion stands still. */
  readonly turn: { readonly yaw: number; readonly pitch: number };
  readonly seconds: number;
  readonly earth: ReturnType<EarthView["stats"]>;
  readonly cosmos: ReturnType<Cosmos["stats"]> | undefined;
  readonly world: WorldStats | undefined;
  readonly flight: ReturnType<Flights["stats"]> | undefined;
}

export const rendered = ({ render, memory }: WebGLRenderer["info"]) => ({
  calls: render.calls,
  points: render.points,
  geometries: memory.geometries,
  textures: memory.textures,
});
