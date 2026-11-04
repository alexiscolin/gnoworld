import {
  CENTRE,
  deepOf,
  earthSystemOf,
  judgeOf,
  LENT,
  projectsOf,
  restView,
  rocksOf,
  systemsOf,
  toScene,
} from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import recorded from "../../../lab/worlds.json" with { type: "json" };
import projects from "../../../data/earthOrbit.json" with { type: "json" };
import { SMALL_RING } from "../earth/orbit.ts";
import { heldOf, type CosmosWorld } from "./cosmosWorld.ts";
import { inDepth } from "./restDeep.ts";

// The view at rest's depth chunk (7p) on Onyx's real file: the bodies the core picks, and the home's rocks put on the stage, each lit by
// the great star, for the labels' chunk to draw as they are.
const ONYX: readonly CosmosWorld[] = recorded.worlds;
const systems = () => systemsOf(heldOf(ONYX));

describe("the view at rest's depth chunk", () => {
  // The Earth's projects (7v) are placed first: the depth's worlds and the rocks keep off them.
  it("gives the Earth's projects, the core's bodies and the home's rocks, each on the stage where it stands on the map, lit from the great star", () => {
    const held = systems();
    const view = restView(held);
    const { earth, bodies, rocks } = inDepth(held, view, LENT);
    const judge = judgeOf(held, view, LENT);
    expect(earth).toEqual(projectsOf(judge, earthSystemOf(projects), SMALL_RING));
    expect(earth.worlds.map(({ id }) => id)).toEqual(["~earth/gnosh.ai"]);
    expect(bodies).toEqual(deepOf(held, view, judge));
    const onMap = rocksOf(view, judge);
    expect(rocks.length).toBe(onMap.length);
    expect(rocks.length).toBeGreaterThan(2);
    onMap.forEach(({ place, radius, shade, turn }, at) => {
      const rock = rocks[at];
      if (rock === undefined) throw new Error("a rock is missing");
      const stage = { x: NaN, y: NaN, z: NaN };
      toScene(place, stage);
      expect(rock.place.x).toBeCloseTo(stage.x, 9);
      expect(rock.place.y).toBeCloseTo(stage.y, 9);
      expect(rock.place.z).toBeCloseTo(stage.z, 9);
      expect({ radius: rock.radius, shade: rock.shade, turn: rock.turn }).toEqual({ radius, shade, turn });
      const way = [CENTRE.x - stage.x, CENTRE.y - stage.y, CENTRE.z - stage.z];
      const length = Math.hypot(...way);
      expect(Math.hypot(rock.toStar.x, rock.toStar.y, rock.toStar.z)).toBeCloseTo(1, 9);
      expect(rock.toStar.x).toBeCloseTo((way[0] ?? NaN) / length, 9);
      expect(rock.toStar.y).toBeCloseTo((way[1] ?? NaN) / length, 9);
      expect(rock.toStar.z).toBeCloseTo((way[2] ?? NaN) / length, 9);
    });
  });
});

// Alexis, 2026-11-03 ("il faut le rangement propre"): what the depth's chunk shares with the view at rest's search and with the labels'
// chunk is written once, read here as text by Vite, never copied to spare a chunk its bytes (7p left two copies, its R5 and R12).
const SOURCES = import.meta.glob<string>(
  [
    "../../**/*.ts",
    "!../../**/*.test.ts",
    "../../../../packages/core/src/**/*.ts",
    "!../../../../packages/core/src/**/*.test.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
// Each time `pattern` is written in the sources, by the file it is written in.
const written = (pattern: RegExp) =>
  Object.entries(SOURCES).flatMap(([path, text]) =>
    [...text.matchAll(pattern)].map(() => path.replace(/^.*\/(?:packages\/core\/src|app\/src)\//, "")),
  );

describe("what the depth's chunk shares", () => {
  it("defines a drawn body's least size, 1.5 times a body's, once, beside a body's in the ladder", () => {
    expect(written(/\b1\.5\s*\*\s*BODY_PIXELS\b|\bBODY_PIXELS\s*\*\s*1\.5\b/g)).toEqual(["lod/ladder.ts"]);
  });

  it("writes a label's stem and its gap by its body once each, in the layout's place", () => {
    expect(written(/\bstem\s*[:=]\s*12\b/g)).toEqual(["lod/place.ts"]);
    expect(written(/\bgap\s*[:=]\s*22\b/g)).toEqual(["lod/place.ts"]);
  });
});
