// @vitest-environment jsdom
import { Drawn, EARTH_RADIUS, plannedOf } from "@gnoworld/core";
import { Group, InstancedBufferGeometry, Mesh, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callersOf } from "./cosmosWorld.ts";
import { CosmosLabels, type Seen } from "./labelled.ts";

// The labels' way in (7h): the Earth's label stands by the globe wherever it is, and hides while it has not come, wherever the projection
// would put the place it waits at.
const SCREEN = { width: 1728, height: 1080, box: undefined };
// An eye 10 units behind the stage's origin: the place the Earth's label waits at is in front of it.
const projector: Seen["projector"] = {
  sight: SCREEN,
  seen(at: Vector3, radius: number) {
    return { x: SCREEN.width / 2 + at.x * 20, y: SCREEN.height / 2 - at.y * 20, radius: radius * 20, depth: 10 - at.z };
  },
  fromEye: (_place, _eye, out) => out,
  anchorOf: () => undefined,
};
const shown = () =>
  [...(document.querySelector("[data-labels]")?.children ?? [])].filter(
    (slot) => slot instanceof HTMLElement && slot.style.opacity === "1",
  );

// jsdom lays nothing out: each pill is given frame 4's size.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(150);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(32);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the labels' way in", () => {
  it("keeps the Earth's label hidden until the globe has come, then stands it by the globe", () => {
    const globe: { at?: Vector3 } = {};
    const part = new CosmosLabels(document, { projector, earth: () => globe.at, earthRadius: EARTH_RADIUS, callersOf });
    part.list([], undefined);
    part.look([], new Drawn(), []);
    part.tick({ x: 0, y: 0, z: 0 }, true);
    expect(shown()).toHaveLength(0);
    globe.at = new Vector3(0, 0, -20);
    part.tick({ x: 0, y: 0, z: 0 }, true);
    expect(shown()).toHaveLength(1);
    expect(shown()[0]?.textContent).toContain("Earth");
    part.dispose();
  });
});

// The home's rocks (7p) come through the labels' chunk, the one a look and a frame reach that costs the cosmos's and the scene's nothing:
// drawn among the bodies once their chunk came, moved with the eye on each frame.
describe("the home's rocks through the labels' way in", () => {
  const rocks = [
    { place: { x: 0, y: 0, z: 10 }, toStar: { x: 0, y: 1, z: 0 }, radius: 0.2, shade: 0.5, turn: 0.2 },
    { place: { x: 2, y: 1, z: 12 }, toStar: { x: 1, y: 0, z: 0 }, radius: 0.1, shade: 0.1, turn: 0.7 },
  ];
  const partWith = (group: Group | undefined) =>
    new CosmosLabels(document, {
      projector: group === undefined ? projector : { ...projector, group },
      earth: () => undefined,
      earthRadius: EARTH_RADIUS,
      callersOf,
    });

  it("draws the rocks a look lays among the bodies once their chunk came, and moves them with the eye", async () => {
    const group = new Group();
    const part = partWith(group);
    const drawn = new Drawn();
    drawn.rocks = rocks;
    part.look([], drawn, []);
    await vi.dynamicImportSettled();
    const [mesh] = group.children;
    expect(mesh).toBeInstanceOf(Mesh);
    const geometry: unknown = mesh instanceof Mesh ? mesh.geometry : undefined;
    if (!(geometry instanceof InstancedBufferGeometry)) throw new Error("no rocks");
    expect(geometry.instanceCount).toBe(2);
    const at = () => geometry.getAttribute("aAt").getX(0);
    part.tick({ x: 0, y: 0, z: 0 }, true);
    const before = at();
    part.tick({ x: 1, y: 0, z: 0 }, true);
    expect(at()).toBeCloseTo(before - 1, 6);
    drawn.rocks = [];
    part.look([], drawn, []);
    expect(geometry.instanceCount).toBe(0);
    part.dispose();
    expect(group.children).toHaveLength(0);
  });

  it("draws in one mesh however many looks lay rocks before the chunk came, and none once its labels are gone", async () => {
    const group = new Group();
    const part = partWith(group);
    const drawn = new Drawn();
    drawn.rocks = rocks;
    part.look([], drawn, []);
    part.look([], drawn, []);
    await vi.dynamicImportSettled();
    expect(group.children).toHaveLength(1);
    part.dispose();
    const gone = new Group();
    const late = partWith(gone);
    late.look([], drawn, []);
    late.dispose();
    await vi.dynamicImportSettled();
    expect(gone.children).toHaveLength(0);
  });

  it("asks nothing for a look that lays none, or with no bodies' group to draw in", async () => {
    const group = new Group();
    const part = partWith(group);
    part.look([], new Drawn(), []);
    await vi.dynamicImportSettled();
    expect(group.children).toHaveLength(0);
    const drawn = new Drawn();
    drawn.rocks = rocks;
    const orphan = partWith(undefined);
    orphan.look([], drawn, []);
    await vi.dynamicImportSettled();
    expect(() => {
      orphan.tick({ x: 0, y: 0, z: 0 }, true);
    }).not.toThrow();
    part.dispose();
    orphan.dispose();
  });
});

// A system's Plan (7v) comes through the labels' chunk too: its ellipses and names in a chunk of their own, asked once a look holds one, its
// words from the file (a world's page is its first realm's view), an amber dot where people are; no pill label while it shows.
describe("a system's Plan through the labels' way in", () => {
  const system = {
    id: "gnoswap",
    place: { x: 0, y: 0, z: 0 },
    star: 2,
    warmth: 0.5,
    spin: 0,
    tilt: 0,
    node: 0,
    belt: false,
    worlds: [],
  };
  const worlds = [
    { id: "gnoswap/router", radius: 0.3, orbit: 1, phase: 0 },
    { id: "gnoswap/pool", radius: 0.3, orbit: 2, phase: 2 },
  ];
  const list = [
    { id: "gnoswap/router", namespace: "gnoswap", realms: [{ callers: 3, path: "gno.land/r/gnoswap/v1/router" }] },
    { id: "gnoswap/pool", namespace: "gnoswap", realms: [{ callers: 1 }] },
  ];
  const signals = {
    present: new Map([["gnoswap/pool", { here: 2, perHour: 1, rise: null }]]),
    names: new Map<string, string>(),
    visited: () => false,
    now: 0,
  };
  const planned = () => {
    const drawn = new Drawn();
    drawn.plan = plannedOf(
      { system, worlds },
      {
        names: new Map([
          ["gnoswap/router", "router"],
          ["gnoswap/pool", "pool"],
        ]),
        links: new Map(),
      },
    );
    return drawn;
  };
  const names = () => [...document.querySelectorAll<HTMLAnchorElement>("[data-plan] a")];

  it("draws the Plan a look holds once its chunk came, its worlds named from the file, who is here marked, no pill label", async () => {
    const group = new Group();
    const part = new CosmosLabels(document, {
      projector: { ...projector, group },
      earth: () => new Vector3(0, 0, -20),
      earthRadius: EARTH_RADIUS,
      callersOf,
    });
    part.list(list, signals);
    part.look([system], planned(), []);
    await vi.dynamicImportSettled();
    part.tick({ x: 0, y: 0, z: 0 }, true);
    expect(names().map(({ textContent }) => textContent)).toEqual(["router", "pool"]);
    expect(names()[0]?.getAttribute("href")).toBe("/r/gnoswap/v1/router");
    expect(names()[1]?.getAttribute("href")).toBeNull();
    expect(names()[1]?.querySelector(".dot[data-tone='warm']")).not.toBeNull();
    expect(shown()).toHaveLength(0);
    part.look([system], new Drawn(), []);
    expect(names()).toEqual([]);
    part.dispose();
    expect(document.querySelector("[data-plan]")).toBeNull();
  });

  // The file's realm paths are the chain's data: one that is no realm's path makes no link, and hands the page nothing.
  it("links a world to its first realm's view only where the file's path is a realm's, and marks none here at nobody", async () => {
    const part = new CosmosLabels(document, {
      projector: { ...projector, group: new Group() },
      earth: () => undefined,
      earthRadius: EARTH_RADIUS,
      callersOf,
    });
    const paths = [
      "gno.land/p/demo/avl",
      "gno.land/r/../evil",
      "gno.land/r/a b",
      "gno.land/r/a?b",
      "gno.land/r//x",
      "",
      "x/r/y",
    ];
    const hostile = paths.map((path, at) => ({
      id: `gnoswap/w${String(at)}`,
      namespace: "gnoswap",
      realms: [{ callers: 0, path }],
    }));
    part.list(hostile, { ...signals, present: new Map([["gnoswap/w0", { here: 0, perHour: 0, rise: null }]]) });
    const drawn = new Drawn();
    drawn.plan = plannedOf(
      { system, worlds: hostile.map(({ id }, at) => ({ id, radius: 0.2, orbit: 1 + at, phase: at })) },
      { names: new Map(hostile.map(({ id }) => [id, id])), links: new Map() },
    );
    part.look([system], drawn, []);
    await vi.dynamicImportSettled();
    expect(names()).toHaveLength(paths.length);
    expect(names().every((name) => !name.hasAttribute("href"))).toBe(true);
    expect(names()[0]?.querySelector(".dot")).toBeNull();
    part.dispose();
  });

  it("hands the page a world's address at a second click, as an event its router reads", async () => {
    const part = new CosmosLabels(document, {
      projector: { ...projector, group: new Group() },
      earth: () => undefined,
      earthRadius: EARTH_RADIUS,
      callersOf,
    });
    part.list(list, signals);
    part.look([system], planned(), []);
    await vi.dynamicImportSettled();
    const opened = vi.fn<(event: Event) => void>();
    window.addEventListener("gnoworld:open", opened);
    names()[0]?.click();
    names()[0]?.click();
    expect((opened.mock.lastCall?.[0] as CustomEvent<string> | undefined)?.detail).toBe("/r/gnoswap/v1/router");
    window.removeEventListener("gnoworld:open", opened);
    part.dispose();
  });
});
