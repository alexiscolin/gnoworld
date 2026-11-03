// @vitest-environment jsdom
import { Drawn, EARTH_RADIUS } from "@gnoworld/core";
import { Group, InstancedBufferGeometry, Mesh, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const part = new CosmosLabels(document, { projector, earth: () => globe.at, earthRadius: EARTH_RADIUS });
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
