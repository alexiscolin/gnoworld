import { LINKS_MOST, MOOD_SCALE, RUN_BLOCKS, systemsOf, type Point } from "@gnoworld/core";
import { WORLDS_CAPS } from "@gnoworld/schemas/indexer";
import { BufferAttribute, LineSegments, Points, type BufferGeometry, type Material, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { Disposer } from "../disposer.ts";
import type { CosmosWorld } from "./cosmosWorld.ts";
import { Web } from "./web.ts";

// The whole cosmos drawn (ADR-0002 §10; Alexis, 2026-11-02): a soft point for each real world, a thin line for each real import between two
// worlds, gold for real live activity and for nothing else. One draw for the points and one for the lines, whatever the file holds.
const WRITTEN = "2026-11-01T00:00:00Z";
const NOW = Date.parse(WRITTEN);
const FOCAL = 1080 / 2 / Math.tan((25 * Math.PI) / 180);
const BLOCK_MS = 4000;

interface Spec {
  readonly count: number;
  /** Each world imports the realm of the world this many on, if any. */
  readonly linkEvery?: number;
  /** The height of each world's last call, if any; the newest is the file's. */
  readonly last?: (at: number) => number | null;
}

const worldsOf = ({ count, linkEvery, last }: Spec): CosmosWorld[] =>
  Array.from({ length: count }, (_, at) => {
    const target = linkEvery === undefined || at % linkEvery !== 0 ? undefined : (at + 1) % count;
    const height = last?.(at) ?? null;
    return {
      id: `n${String(at % Math.ceil(count / 4))}/w${String(at)}`,
      namespace: `n${String(at % Math.ceil(count / 4))}`,
      realms: [
        {
          path: `gno.land/r/n${String(at % Math.ceil(count / 4))}/w${String(at)}`,
          imports:
            target === undefined
              ? ["gno.land/p/nt/avl/v0"]
              : [`gno.land/r/n${String(target % Math.ceil(count / 4))}/w${String(target)}`],
          callers: null,
          calls: height === null ? null : 12,
          lastHeight: height,
        },
      ],
    };
  });

const held = (worlds: readonly CosmosWorld[]) =>
  systemsOf(worlds.map(({ id, namespace }) => ({ id, namespace, use: 1 })));

// `written: null` stands a file with no time; `now` is when it is read, at the stand and at each look.
function stood(spec: Spec, { written = WRITTEN, now = NOW }: { written?: string | null; now?: number } = {}) {
  const owner = new Disposer();
  const web = owner.add(new Web());
  const worlds = worldsOf(spec);
  web.stand({ systems: held(worlds), worlds, written: written ?? undefined }, now);
  return { owner, web, worlds, now };
}

// What the group draws: each Points or LineSegments, its geometry and its materials.
interface Drawn {
  readonly type: string;
  readonly geometry: BufferGeometry;
  readonly materials: readonly Material[];
}
const drawables = (web: Web): Drawn[] => {
  const found: Drawn[] = [];
  web.group.traverse((object: Object3D) => {
    if (object instanceof Points || object instanceof LineSegments)
      found.push({
        type: object.type,
        geometry: object.geometry as BufferGeometry,
        materials: [object.material as Material | Material[]].flat(),
      });
  });
  return found;
};
const geometryOf = (web: Web, type: "Points" | "LineSegments"): BufferGeometry => {
  const found = drawables(web).find((each) => each.type === type);
  if (found === undefined) throw new Error(`no ${type}`);
  return found.geometry;
};
const attribute = (geometry: BufferGeometry, name: string): BufferAttribute => {
  const found = geometry.getAttribute(name);
  if (!(found instanceof BufferAttribute)) throw new Error(`no ${name}`);
  return found;
};
// Each vertex drawn, through the geometry's index where it has one, as a row of the named attributes.
const rows = (geometry: BufferGeometry, names: readonly string[]): string[] => {
  const cells = (name: string, at: number) => {
    const { array, itemSize } = attribute(geometry, name);
    return Array.from({ length: itemSize }, (_, item) => (array[at * itemSize + item] ?? NaN).toFixed(6)).join(",");
  };
  const vertexOf = (drawn: number) => geometry.index?.getX(drawn) ?? drawn;
  return Array.from({ length: geometry.drawRange.count }, (_, at) =>
    names.map((name) => cells(name, vertexOf(at))).join(" "),
  ).sort();
};

// The eye on the map, `height` above what it looks at, gno.land's star at the map's centre.
const lookFrom = (web: Web, height: number, { aside = 0, now = NOW }: { aside?: number; now?: number } = {}) => {
  const eye: Point = { x: aside, y: height, z: 0 };
  web.look({ eye, focal: FOCAL, focus: height }, now);
};

describe("the whole cosmos", () => {
  for (const count of [100, 1_000, 10_000, WORLDS_CAPS.worlds])
    it(`holds one draw for its points and one for its lines at ${String(count)} worlds, no object per world`, () => {
      const { web, owner } = stood({ count, linkEvery: 3 });
      lookFrom(web, MOOD_SCALE * 2);
      expect(drawables(web)).toHaveLength(2);
      expect(web.group.children).toHaveLength(2);
      for (const child of web.group.children) expect(child.children).toHaveLength(0);
      expect(geometryOf(web, "Points").drawRange.count).toBe(count);
      const lines = geometryOf(web, "LineSegments").drawRange.count;
      expect(lines).toBe(2 * Math.min(Math.ceil(count / 3), LINKS_MOST));
      expect(web.stats()).toMatchObject({ points: count, lines: lines / 2 });
      owner.dispose();
    });

  it("draws the same set as the same picture, in any order", () => {
    const worlds = worldsOf({ count: 300, linkEvery: 2 });
    const pictures = [worlds, [...worlds].reverse()].map((list) => {
      const owner = new Disposer();
      const web = owner.add(new Web());
      web.stand({ systems: held(list), worlds: list, written: WRITTEN }, NOW);
      lookFrom(web, 900, { aside: 30 });
      const picture = {
        points: rows(geometryOf(web, "Points"), ["position", "aCircle", "aTint", "aSoft"]),
        lines: rows(geometryOf(web, "LineSegments"), ["position", "aCircle", "aTint"]),
      };
      owner.dispose();
      return picture;
    });
    expect(pictures[1]).toEqual(pictures[0]);
    expect(pictures[0]?.lines).toHaveLength(300);
  });

  it("draws a line only where the file holds a link: none from the recorded file, which read no package", () => {
    const { web, owner } = stood({ count: 533 });
    lookFrom(web, 900);
    expect(geometryOf(web, "LineSegments").drawRange.count).toBe(0);
    expect(web.stats().lines).toBe(0);
    owner.dispose();
  });

  it("stands each line's two ends where its two worlds' points stand", () => {
    const { web, owner, worlds } = stood({ count: 40, linkEvery: 5 });
    lookFrom(web, 900);
    const points = geometryOf(web, "Points");
    const lines = geometryOf(web, "LineSegments");
    const placed = new Set(rows(points, ["position", "aCircle"]));
    const ends = rows(lines, ["position", "aCircle"]);
    expect(ends).toHaveLength(2 * Math.ceil(worlds.length / 5));
    for (const end of ends) expect(placed.has(end)).toBe(true);
    owner.dispose();
  });

  it("lights no gold with no activity: no call read, no time for the file, no call counted, or a call a whole run old", () => {
    const newest = 50_000;
    for (const [spec, written] of [
      [{ count: 200 }, WRITTEN],
      [{ count: 200, last: () => 1000 }, null],
    ] as const) {
      const { web, owner } = stood(spec, { written });
      lookFrom(web, 900);
      expect(web.stats().gold).toBe(0);
      owner.dispose();
    }
    // World 1's last call stands a whole run before the newest: its light has just gone out.
    const { web, owner, worlds } = stood({ count: 3, last: (at) => [newest, newest - RUN_BLOCKS, null][at] ?? null });
    lookFrom(web, 900);
    expect(web.stats().gold).toBe(1);
    owner.dispose();
    // No call counted, a height read: no run.
    const quiet = worlds.map((world) => ({ ...world, realms: world.realms.map((realm) => ({ ...realm, calls: 0 })) }));
    const silent = new Web();
    silent.stand({ systems: held(quiet), worlds: quiet, written: WRITTEN }, NOW);
    silent.look({ eye: { x: 0, y: 900, z: 0 }, focal: FOCAL, focus: 900 }, NOW);
    expect(silent.stats().gold).toBe(0);
    silent.dispose();
  });

  it("lets a world's gold go as its run ends, on a page left open: each look reads the time", () => {
    const { web, owner } = stood({ count: 30, last: (at) => (at === 0 ? 50_000 : null) });
    lookFrom(web, 900);
    expect(web.stats().gold).toBe(1);
    lookFrom(web, 900, { now: NOW + (RUN_BLOCKS + 1) * BLOCK_MS });
    expect(web.stats().gold).toBe(0);
    owner.dispose();
  });

  it("gives a live world a gold point, its gold fading with its run, and leaves every other point the colour it has with no activity", () => {
    // Each world's row: where it stands, its orbit, which is its own, and its tint.
    const tints = (last: ((at: number) => number | null) | undefined, now = NOW) => {
      const { web, owner } = stood({ count: 30, ...(last === undefined ? {} : { last }) });
      lookFrom(web, 900, { now });
      const found = rows(geometryOf(web, "Points"), ["position", "aCircle", "aTint"]);
      owner.dispose();
      return found;
    };
    const tintOf = (row: string | undefined) => (row?.split(" ")[2] ?? "").split(",").map(Number);
    const quiet = tints(undefined);
    const liveAt = (now: number) => tints((at) => (at === 0 ? 50_000 : null), now);
    const full = liveAt(NOW);
    const changed = full.filter((row) => !quiet.includes(row));
    expect(changed).toHaveLength(1);
    const own = tintOf(quiet.find((row) => !full.includes(row)));
    const gold = tintOf(changed[0]);
    const [red = 0, green = 0, blue = 0] = gold;
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue * 1.6);
    // Half a run later, strictly between its quiet colour and its gold, on every channel that moves.
    const half = tintOf(liveAt(NOW + (RUN_BLOCKS / 2) * BLOCK_MS).find((row) => !quiet.includes(row)));
    for (const channel of [0, 1, 2]) {
      const [from = 0, to = 0, between = NaN] = [own[channel], gold[channel], half[channel]];
      if (Math.abs(to - from) < 1e-3) continue;
      expect(between).toBeGreaterThan(Math.min(from, to));
      expect(between).toBeLessThan(Math.max(from, to));
    }
  });

  it("holds its lines' bound whatever the file names: every world linked to every other", () => {
    const worlds: CosmosWorld[] = Array.from({ length: 300 }, (_, at) => ({
      id: `n${String(at % 30)}/w${String(at)}`,
      namespace: `n${String(at % 30)}`,
      realms: [
        {
          callers: null,
          path: `gno.land/r/n${String(at % 30)}/w${String(at)}`,
          imports: Array.from({ length: 300 }, (__, other) => `gno.land/r/n${String(other % 30)}/w${String(other)}`),
        },
      ],
    }));
    const web = new Web();
    web.stand({ systems: held(worlds), worlds, written: WRITTEN }, NOW);
    lookFrom(web, 900);
    expect(geometryOf(web, "LineSegments").drawRange.count).toBe(2 * LINKS_MOST);
    expect(web.stats().lines).toBe(LINKS_MOST);
    web.dispose();
  });

  it("frees the set it stood before when it stands another", () => {
    const { web, owner, worlds } = stood({ count: 50, linkEvery: 2 });
    const freed: string[] = [];
    for (const { geometry, type } of drawables(web)) geometry.addEventListener("dispose", () => freed.push(type));
    web.stand({ systems: held(worlds), worlds, written: WRITTEN }, NOW);
    expect(freed.sort()).toEqual(["LineSegments", "Points"]);
    expect(web.group.children).toHaveLength(2);
    owner.dispose();
  });

  it("never keeps a point's size as the eye leaves", () => {
    const { web, owner } = stood({ count: 200 });
    const sizes = (height: number) => {
      lookFrom(web, height);
      const soft = attribute(geometryOf(web, "Points"), "aSoft");
      return Array.from({ length: 200 }, (_, at) => [soft.getX(at), soft.getY(at)]);
    };
    const near = sizes(MOOD_SCALE * 1.2);
    const far = sizes(MOOD_SCALE * 3);
    for (const [at, [size, light]] of far.entries()) {
      const [nearSize, nearLight] = near[at] ?? [0, 0];
      expect(size).toBeLessThanOrEqual(nearSize ?? 0);
      expect((size ?? 0) < (nearSize ?? 0) || (light ?? 0) < (nearLight ?? 0)).toBe(true);
    }
    owner.dispose();
  });

  it("writes nothing on a frame: a frame moves the clock, the share and where the eye is", () => {
    const { web, owner } = stood({ count: 500, linkEvery: 2 });
    lookFrom(web, 900);
    const versions = () =>
      [geometryOf(web, "Points"), geometryOf(web, "LineSegments")].flatMap((geometry) =>
        Object.values(geometry.attributes).map((each) => ("version" in each ? each.version : -1)),
      );
    const before = versions();
    for (let frame = 0; frame < 30; frame += 1) web.advance({ x: 10, y: 900 + frame, z: 0 }, frame / 60, 0.5);
    expect(versions()).toEqual(before);
    owner.dispose();
  });

  it("draws nothing while its share is none, and shows it as the share comes", () => {
    const { web, owner } = stood({ count: 100, linkEvery: 2 });
    lookFrom(web, 900);
    web.advance({ x: 0, y: 900, z: 0 }, 0, 0);
    expect(web.group.visible).toBe(false);
    expect(web.stats().share).toBe(0);
    web.advance({ x: 0, y: 900, z: 0 }, 0, 0.25);
    expect(web.group.visible).toBe(true);
    expect(web.stats().share).toBe(0.25);
    owner.dispose();
  });

  it("draws a world the file names twice as one point", () => {
    const [first, ...rest] = worldsOf({ count: 20 });
    if (first === undefined) throw new Error("no world");
    const worlds = [first, ...rest, first];
    const web = new Web();
    web.stand({ systems: held(worlds), worlds, written: WRITTEN }, NOW);
    lookFrom(web, 900);
    expect(web.stats().points).toBe(20);
    expect(geometryOf(web, "Points").drawRange.count).toBe(20);
    web.dispose();
  });

  it("frees its two draws with its owner", () => {
    const { web, owner } = stood({ count: 100, linkEvery: 2 });
    const disposed: string[] = [];
    for (const { geometry, materials } of drawables(web)) {
      geometry.addEventListener("dispose", () => disposed.push("geometry"));
      for (const each of materials) each.addEventListener("dispose", () => disposed.push("material"));
    }
    owner.dispose();
    expect(disposed.sort()).toEqual(["geometry", "geometry", "material", "material"]);
    expect(web.group.parent).toBeNull();
  });
});
