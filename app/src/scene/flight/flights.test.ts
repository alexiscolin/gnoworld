// @vitest-environment jsdom
import {
  EARTH_PLACE,
  flightSeconds,
  HOME,
  MIDDLE,
  onPlane,
  stopNear,
  systemsOf,
  toMap,
  toScene,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import {
  FramebufferTexture,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene as Stage,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Eye } from "../eye.ts";
import { Flights, type FlightDevice, type FlightSaid } from "./flights.ts";

// The flights (7g; ADR-0001 §7; docs/DESIGN-SYSTEM.md, "Motion"): the jump to a star the reader aims at, the way back to the view at rest, and
// a page's flight, its body coming from afar. The scene's camera stays at the origin: a flight writes the eye's way, what it looks at and how
// far the page's body stands, and the panel hears it ten times a second at most.
const FRAME = 1000 / 60;
// The window jsdom gives, which the canvas fills.
const WIDTH = innerWidth;
const HEIGHT = innerHeight;
const ADDRESS = "g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2";

const held = (systems: number, each: number) =>
  Array.from({ length: systems }, (_, system) =>
    Array.from({ length: each }, (__, world) => ({
      id: `n${String(system)}/w${String(world)}`,
      namespace: `n${String(system)}`,
      use: 1 + ((system * 7 + world * 3) % 11) * 15,
    })),
  ).flat();

// A star of `id` standing at `at` on the stage, with no world unless given.
function starAt(id: string, at: Point, worlds: StarSystem["worlds"] = []): StarSystem {
  const place = { x: NaN, y: NaN, z: NaN };
  toMap(at, place);
  return { id, place, star: 1, warmth: 0.5, spin: 0, tilt: 0, node: 0, belt: false, worlds };
}

interface Options {
  readonly systems?: StarSystem[];
  readonly yaw?: number;
  readonly pitch?: number;
}

// The scene around the flights: three's objects for real, the renderer's draws counted, the cosmos as it reads to a flight: its systems,
// the eye it places (where the scene's eye stands, plus the flight's way) and its bodies' projection.
function rig({ systems = systemsOf(held(30, 3)), yaw = 0, pitch = 0 }: Options = {}) {
  const camera = new PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 2000);
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();
  const stage = new Stage();
  const eye = new Eye();
  // Where the view rests on the stage: the cosmos lies ahead of it.
  const base = { x: HOME.x, y: HOME.y, z: HOME.z };
  const lift = { value: { x: 0, y: 0, z: 0 } };
  const placed = () => ({
    x: base.x + eye.travel.x + lift.value.x,
    y: base.y + eye.travel.y + lift.value.y,
    z: base.z + eye.travel.z + lift.value.z,
  });
  const copies: FramebufferTexture[] = [];
  const freed = new Set<FramebufferTexture>();
  const renderer = {
    render: vi.fn<(scene: Stage, camera: PerspectiveCamera) => void>((scene) => {
      scene.onAfterRender(renderer as never, scene, camera, undefined as never, undefined as never, undefined as never);
    }),
    copyFramebufferToTexture: vi.fn<(texture: FramebufferTexture) => void>((texture) => {
      copies.push(texture);
      texture.addEventListener("dispose", () => freed.add(texture));
    }),
    getDrawingBufferSize: (into: Vector2) => into.set(WIDTH, HEIGHT),
    compileAsync: vi.fn<(scene: Object3D, camera: PerspectiveCamera, target?: Stage) => Promise<Object3D>>(() =>
      Promise.resolve(stage),
    ),
  };
  const said: (FlightSaid | undefined)[] = [];
  const moved = { count: 0 };
  const still = { value: false };
  const shows = { value: true };
  const earth = { x: NaN, y: NaN, z: NaN };
  toScene(EARTH_PLACE, earth);
  const device: FlightDevice = {
    renderer: renderer as unknown as FlightDevice["renderer"],
    stage,
    camera,
    eye,
    arrival: { approach: 1, aside: 0 },
    said: (flight) => {
      said.push(flight === undefined ? undefined : { ...flight });
    },
    moved: () => {
      moved.count += 1;
    },
    still: () => still.value,
    cosmos: () =>
      shows.value
        ? {
            systems: () => systems,
            get eye() {
              return placed();
            },
            earth,
            lit: MIDDLE,
            toScene,
            toMap,
            onPlane,
          }
        : undefined,
  };
  return { device, eye, camera, stage, said, moved, copies, freed, renderer, still, placed, systems, shows, lift };
}
type Rig = ReturnType<typeof rig>;

let made: Flights[] = [];
const flights = (device: FlightDevice) => {
  const flown = new Flights(device);
  made.push(flown);
  return flown;
};

// What a flight cannot act on it reports, as the browser's reportError does; jsdom has none.
const reported = vi.fn<(error: unknown) => void>();
beforeEach(() => {
  made = [];
  vi.stubGlobal("reportError", reported);
});
afterEach(() => {
  for (const flown of made) flown.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  reported.mockClear();
});

// Frames of 1/60 s for `seconds`, the eye advanced after each as the scene does, and `each` told of each.
function run(flown: Flights, { eye }: Rig, timed: number | { seconds: number; each: (at: number) => void }) {
  const { seconds, each } = typeof timed === "number" ? { seconds: timed, each: () => undefined } : timed;
  const frames = Math.round((seconds * 1000) / FRAME);
  for (let at = 0; at < frames; at += 1) {
    flown.advance(FRAME);
    eye.advance(FRAME, false);
    each(at);
  }
}
const frame = (flown: Flights, scene: Rig) => {
  run(flown, scene, FRAME / 1000);
};

// Where a flight to `system` from the rig's eye stops, and the star it looks at, on the stage.
function endOf(scene: Rig, system: StarSystem) {
  const map = { x: NaN, y: NaN, z: NaN };
  toMap(scene.placed(), map);
  const stop = { x: NaN, y: NaN, z: NaN };
  stopNear(system, map, stop);
  const eye = { x: NaN, y: NaN, z: NaN };
  toScene(stop, eye);
  const star = { x: NaN, y: NaN, z: NaN };
  toScene(system.place, star);
  return { eye, star, distance: Math.hypot(map.x - stop.x, map.y - stop.y, map.z - stop.z) };
}

// Every star in front of the eye, where it stands on screen.
function starsOnScreen(scene: Rig) {
  const from = scene.placed();
  return scene.systems.flatMap((system) => {
    const at = new Vector3();
    toScene(system.place, at);
    at.set(at.x - from.x, at.y - from.y, at.z - from.z);
    const ahead = at.clone().applyQuaternion(scene.camera.quaternion.clone().invert()).z < 0;
    const seen = at.clone().project(scene.camera);
    return ahead && Math.abs(seen.x) < 0.9 && Math.abs(seen.y) < 0.9
      ? [{ system, x: ((seen.x + 1) * WIDTH) / 2, y: ((1 - seen.y) * HEIGHT) / 2 }]
      : [];
  });
}

// A point of the screen with no star within 40 pixels.
function emptyPoint(spots: readonly { x: number; y: number }[]) {
  for (let x = 20; x < WIDTH; x += 20)
    for (let y = 20; y < HEIGHT; y += 20)
      if (spots.every((spot) => Math.hypot(spot.x - x, spot.y - y) > 40)) return { x, y };
  throw new Error("no empty point");
}

// A stage point `ahead` units in front of the rig's eye, `right` and `up` of the view's axis, as the identity camera sees it.
const ahead = (scene: Rig, [right, up, along]: readonly [number, number, number]): Point => {
  const from = scene.placed();
  return { x: from.x + right, y: from.y + up, z: from.z - along };
};
// Where a stage point stands on the rig's screen.
const onScreen = (scene: Rig, at: Point) => {
  const from = scene.placed();
  const seen = new Vector3(at.x - from.x, at.y - from.y, at.z - from.z).project(scene.camera);
  return { x: ((seen.x + 1) * WIDTH) / 2, y: ((1 - seen.y) * HEIGHT) / 2 };
};

const away = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const pick = (scene: Rig, at = 5) => {
  const system = scene.systems[at];
  if (system === undefined) throw new Error("no system");
  return system;
};
const flying = (said: readonly (FlightSaid | undefined)[]) => said.filter((one) => one !== undefined);
const click = (target: EventTarget, x: number, y: number) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
const escape = (target: EventTarget = document.body, cancelled = false) => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  if (cancelled) event.preventDefault();
  target.dispatchEvent(event);
};
const press = () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
const freedOn = (target: { addEventListener: (type: "dispose", run: () => void) => void } | undefined) => {
  const freed = { value: false };
  target?.addEventListener("dispose", () => {
    freed.value = true;
  });
  return freed;
};
const withAttribute = <T extends HTMLElement>(element: T, name: string, value: string): T => {
  element.setAttribute(name, value);
  return element;
};
const editable = () =>
  withAttribute(withAttribute(document.createElement("div"), "contenteditable", "true"), "tabindex", "0");
const veilOn = (stage: Stage) => stage.children.some(({ name }) => name === "dissolve");

describe("the jump to a star", () => {
  it("takes the time its distance gives, out of orbit and into the next slowly, and stops where core says, looking at the star", () => {
    const scene = rig();
    const flown = flights(scene.device);
    const system = pick(scene);
    const end = endOf(scene, system);
    const seconds = flightSeconds(end.distance);
    const start = scene.placed();
    flown.fly({ kind: "star", id: system.id });
    expect(flown.stats().seconds).toBeCloseTo(seconds, 9);
    const places: Point[] = [start];
    let landedAt = -1;
    run(flown, scene, {
      seconds: seconds + 0.2,
      each: (at) => {
        places.push(scene.placed());
        if (landedAt < 0 && !flown.stats().flying) landedAt = at;
      },
    });
    const frames = Math.round((seconds * 1000) / FRAME);
    expect(landedAt).toBeGreaterThan(0.9 * frames);
    expect(away(scene.placed(), end.eye)).toBeLessThan(1e-6);
    expect(away(scene.eye.look ?? start, end.star)).toBeLessThan(1e-6);
    const way = away(start, end.eye);
    const steps = places.slice(1).map((place, at) => away(place, places[at] ?? place));
    const peak = Math.max(...steps);
    // Out of orbit and into the next: each end's tenth covers under a fortieth of the way, and moves at under a third of the peak.
    expect(away(start, places[Math.floor(frames / 10)] ?? start)).toBeLessThan(way / 40);
    expect(away(places[Math.ceil((9 * frames) / 10)] ?? start, end.eye)).toBeLessThan(way / 40);
    expect(steps[Math.round(0.9 * frames)] ?? Infinity).toBeLessThan(peak / 3);
    expect(scene.moved.count).toBe(1);
    expect(flown.busy).toBe(false);
    expect(flown.stats()).toMatchObject({ flying: false, along: 1 });
  });

  it("tells the panel its target, its phases in order and its instruments, ten times a second at most, then that it landed", () => {
    const scene = rig();
    const flown = flights(scene.device);
    const system = pick(scene);
    const seconds = flightSeconds(endOf(scene, system).distance);
    flown.fly({ kind: "star", id: system.id });
    run(flown, scene, seconds + 0.2);
    const heard = flying(scene.said);
    expect(heard.every(({ target }) => target === system.id)).toBe(true);
    expect([...new Set(heard.map(({ phase }) => phase))]).toEqual(["leaving", "transit", "entering"]);
    expect(heard.length).toBeLessThanOrEqual(Math.ceil(seconds * 10) + 3);
    expect(heard.length).toBeGreaterThanOrEqual(Math.floor(seconds * 10) - 1);
    const etas = heard.map(({ eta }) => eta);
    expect(etas).toEqual([...etas].sort((a, b) => b - a));
    expect(heard[0]?.along).toBe(0);
    expect(scene.said.at(-1)).toBeUndefined();
  });

  it("names a star by the name its namespace or its first world gives, never by an address, and cuts a long one", () => {
    const at = { x: HOME.x, y: HOME.y, z: HOME.z - 60 };
    const world = { id: `${ADDRESS}/gnoslinger`, radius: 0.5, orbit: 2, phase: 0 };
    const scene = rig({ systems: [starAt(ADDRESS, at, [world]), starAt("x".repeat(200), { ...at, x: 40 })] });
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: ADDRESS });
    frame(flown, scene);
    expect(flying(scene.said)[0]?.target).toBe("gnoslinger");
    flown.fly({ kind: "star", id: "x".repeat(200) });
    frame(flown, scene);
    const long = flying(scene.said).at(-1)?.target ?? "";
    expect([...new Intl.Segmenter().segment(long)].length).toBeLessThanOrEqual(24);
    expect(long.endsWith("…")).toBe(true);
    expect(flying(scene.said).some(({ target }) => target.includes(ADDRESS))).toBe(false);
  });

  it("flies to no star the cosmos does not hold, from no eye the cosmos has not placed yet, and none while it does not show", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: "nowhere" });
    expect(flown.stats().flying).toBe(false);
    scene.lift.value = { x: NaN, y: 0, z: 0 };
    flown.fly({ kind: "star", id: pick(scene).id });
    expect(flown.stats().flying).toBe(false);
    scene.lift.value = { x: 0, y: 0, z: 0 };
    scene.shows.value = false;
    flown.fly({ kind: "star", id: pick(scene).id });
    expect(flown.stats().flying).toBe(false);
    expect(scene.eye.travel).toEqual({ x: 0, y: 0, z: 0 });
    expect(scene.moved.count).toBe(0);
  });

  it("flies to the star the eye already stands by without a step out of the finite", () => {
    const scene = rig();
    const flown = flights(scene.device);
    const system = pick(scene);
    flown.fly({ kind: "star", id: system.id });
    run(flown, scene, 4);
    flown.fly({ kind: "star", id: system.id });
    run(flown, scene, 4);
    expect(Number.isFinite(scene.eye.travel.x + scene.eye.travel.y + scene.eye.travel.z)).toBe(true);
    expect(away(scene.placed(), endOf(scene, system).eye)).toBeLessThan(1e-6);
  });

  it("reads a frame of no time as none, and a frame of hours as a quarter of a second at most", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    flown.advance(Number.NaN);
    expect(flown.stats().along).toBe(0);
    expect(Number.isFinite(scene.eye.travel.x)).toBe(true);
    flown.advance(1e9);
    expect(flown.stats().along).toBeCloseTo(Math.min(1, 0.25 / flown.stats().seconds), 9);
  });
});

describe("aiming at a star", () => {
  // The scene's camera always turns to the Earth: a projection that left the turn out passed on the identity (lot A's review, F3710).
  it.each([
    ["looking straight ahead", { yaw: 0, pitch: 0 }],
    ["turned as the camera turns to the Earth", { yaw: 0.6, pitch: -0.25 }],
  ])("goes to the star nearest a click on space within 24 pixels, and to none 30 pixels off, %s", (_, turn) => {
    const scene = rig(turn);
    const flown = flights(scene.device);
    const spots = starsOnScreen(scene);
    const lone = spots.find((spot) =>
      spots.every((other) => other === spot || Math.hypot(other.x - spot.x, other.y - spot.y) > 60),
    );
    if (lone === undefined) throw new Error("no star alone on screen");
    const end = endOf(scene, lone.system);
    click(document.body, lone.x + 30, lone.y);
    const empty = emptyPoint(spots);
    click(document.body, empty.x, empty.y);
    expect(flown.stats().flying).toBe(false);
    click(document.body, lone.x + 16, lone.y - 16);
    expect(flown.stats()).toMatchObject({ flying: true, kind: "star", target: lone.system.id });
    run(flown, scene, 4);
    expect(away(scene.placed(), end.eye)).toBeLessThan(1e-6);
  });

  // The suns give a star no light past the ladder's middle reach from the eye (suns.ts, MIDDLE): a click there is on empty space, and flies
  // nowhere; at 2,000 systems 43% of the clicks in reach fell on such a star (lot A's review, F3714).
  it.each([
    [MIDDLE + 10, false],
    [MIDDLE - 20, true],
  ])("flies to a star %s units from the eye: %s, the suns lighting none past their middle reach", (distance, flies) => {
    const base = rig();
    const where = ahead(base, [0, 0, distance]);
    const scene = rig({ systems: [starAt("star", where)] });
    const flown = flights(scene.device);
    const spot = onScreen(scene, where);
    click(document.body, spot.x, spot.y);
    expect(flown.stats().flying).toBe(flies);
  });

  it("takes the nearer of two stars in reach, and none behind the eye whose picture would fall there", () => {
    const base = rig();
    const near = ahead(base, [1.2, 0.4, 60]);
    const nearer = ahead(base, [0.5, 0.2, 61]);
    const scene = rig({ systems: [starAt("near", near), starAt("nearer", nearer)] });
    const flown = flights(scene.device);
    const [first, second] = [onScreen(scene, near), onScreen(scene, nearer)];
    const between = { x: (first.x + 2 * second.x) / 3, y: (first.y + 2 * second.y) / 3 };
    expect(Math.hypot(first.x - between.x, first.y - between.y)).toBeLessThan(24);
    click(document.body, between.x, between.y);
    expect(flown.stats().target).toBe("nearer");
    flown.land();
    const lone = rig({ systems: [starAt("behind", { x: HOME.x - 1.2, y: HOME.y - 0.4, z: HOME.z + 60 })] });
    const alone = flights(lone.device);
    const mirrored = onScreen(lone, { x: HOME.x + 1.2, y: HOME.y + 0.4, z: HOME.z - 60 });
    click(document.body, mirrored.x, mirrored.y);
    expect(alone.stats().flying).toBe(false);
  });

  it.each([
    ["a link", () => Object.assign(document.createElement("a"), { href: "#space" })],
    ["a button", () => document.createElement("button")],
    ["a field", () => document.createElement("input")],
    ["a text box", () => document.createElement("textarea")],
    ["an editable line", () => editable()],
    ["a panel's words", () => document.createElement("section").appendChild(document.createElement("p")).parentElement],
  ])("aims at nothing through %s", (_, make) => {
    const scene = rig();
    const flown = flights(scene.device);
    const [star] = starsOnScreen(scene);
    if (star === undefined) throw new Error("no star on screen");
    const made = make();
    if (made === null) throw new Error("nothing made");
    document.body.append(made);
    click(made.querySelector("p") ?? made, star.x, star.y);
    expect(flown.stats().flying).toBe(false);
  });

  it("only lands on a click mid-way: the same click starts no other flight", () => {
    const scene = rig();
    const flown = flights(scene.device);
    const spots = starsOnScreen(scene);
    const [first, second] = spots;
    if (first === undefined || second === undefined) throw new Error("two stars wanted");
    flown.fly({ kind: "star", id: first.system.id });
    run(flown, scene, 0.4);
    press();
    click(document.body, second.x, second.y);
    expect(flown.stats().flying).toBe(false);
    expect(flown.stats().target).toBe(first.system.id);
  });
});

describe("landing at once (DESIGN-SYSTEM.md, Motion)", () => {
  it.each([
    [
      "Escape",
      () => {
        escape();
      },
    ],
    ["a click", press],
  ])("lands on %s mid-way, where the flight would have ended", (_, act) => {
    const scene = rig();
    const flown = flights(scene.device);
    const system = pick(scene);
    const end = endOf(scene, system);
    flown.fly({ kind: "star", id: system.id });
    run(flown, scene, 0.5);
    act();
    frame(flown, scene);
    expect(away(scene.placed(), end.eye)).toBeLessThan(1e-6);
    expect(scene.said.at(-1)).toBeUndefined();
    expect(flown.busy).toBe(false);
  });

  it("flies back to the view at rest on Escape once at a star, its way undone and its look given back", () => {
    const scene = rig();
    const flown = flights(scene.device);
    const start = scene.placed();
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    escape();
    expect(flown.stats()).toMatchObject({ flying: true, kind: "rest", target: "Cosmos" });
    run(flown, scene, 4);
    expect(scene.eye.travel).toEqual({ x: 0, y: 0, z: 0 });
    expect(away(scene.placed(), start)).toBe(0);
    expect(scene.eye.look).toBeUndefined();
  });

  it("lands the way back too on Escape, and does nothing on Escape at rest", () => {
    const scene = rig();
    const flown = flights(scene.device);
    escape();
    expect(flown.stats().flying).toBe(false);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    escape();
    run(flown, scene, 0.3);
    escape();
    frame(flown, scene);
    expect(flown.stats().flying).toBe(false);
    expect(scene.eye.travel).toEqual({ x: 0, y: 0, z: 0 });
    escape();
    expect(flown.stats().flying).toBe(false);
  });

  it.each([
    ["a field", () => document.createElement("input")],
    ["a text box", () => document.createElement("textarea")],
    ["a list", () => document.createElement("select")],
    ["an editable line", () => editable()],
  ])("hears no Escape that %s holds with the focus", (_, make) => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    const field = document.body.appendChild(make());
    field.focus();
    escape(field);
    expect(flown.stats().flying).toBe(false);
  });

  it.each([
    ["a dialog", () => withAttribute(document.createElement("dialog"), "open", "")],
    ["a dialog by its role", () => withAttribute(document.createElement("div"), "role", "dialog")],
  ])("hears no Escape while %s is open, nor one the page already took", (_, make) => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    escape(document.body, true);
    expect(flown.stats().flying).toBe(false);
    document.body.append(make());
    escape();
    expect(flown.stats().flying).toBe(false);
  });

  // A chained flight that started its look from the Earth snapped the camera on its first frame (lot A's review, F3713).
  it("starts a new flight looking where the eye looks, the camera turning less than 0.05 radians on its first frame", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene, 3).id });
    run(flown, scene, 0.8);
    const facing = () => {
      const [from, look] = [scene.placed(), scene.eye.look ?? scene.placed()];
      return new Vector3(look.x - from.x, look.y - from.y, look.z - from.z).normalize();
    };
    const before = facing();
    flown.fly({ kind: "star", id: pick(scene, 9).id });
    frame(flown, scene);
    expect(before.angleTo(facing())).toBeLessThan(0.05);
  });

  it("starts a new flight from where the eye is, with no jump", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene, 3).id });
    run(flown, scene, 0.8);
    const before = scene.placed();
    flown.fly({ kind: "star", id: pick(scene, 9).id });
    frame(flown, scene);
    expect(away(before, scene.placed())).toBeLessThan(1);
  });
});

describe("under reduced motion", () => {
  it("moves no camera: the frame drawn is copied, the eye stands at the end at once, and the copy fades in 0.2 s; no panel", () => {
    const scene = rig();
    scene.still.value = true;
    const flown = flights(scene.device);
    const system = pick(scene);
    const end = endOf(scene, system);
    flown.fly({ kind: "star", id: system.id });
    expect(scene.copies).toHaveLength(1);
    frame(flown, scene);
    expect(away(scene.placed(), end.eye)).toBeLessThan(1e-6);
    expect(flown.stats().veil).toBeGreaterThan(0.8);
    run(flown, scene, 0.2);
    expect(flown.stats().veil).toBe(0);
    expect(scene.freed.size).toBe(1);
    expect(veilOn(scene.stage)).toBe(false);
    expect(flying(scene.said)).toEqual([]);
    expect(flown.stats().streaks).toBe(0);
    expect(flown.busy).toBe(false);
  });

  it("brings a page's body to its place at once", () => {
    const scene = rig();
    scene.still.value = true;
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    frame(flown, scene);
    expect(scene.device.arrival.approach).toBe(1);
    expect(flying(scene.said)).toEqual([]);
  });
});

// A world's page, then one without space, then the home: no flight brings the cosmos back, and the eye stood 60 units past its view at
// rest, where the world's flight had left it (lot B's review, F3705). The cosmos shown again with no flight under way is the home's view.
describe("the cosmos shown again with no flight bringing it", () => {
  const ZERO = { x: 0, y: 0, z: 0 };

  it("gives the eye back to the view at rest after a page's flight, once the cosmos shows, never while it is hidden", () => {
    const scene = rig();
    const flown = flights(scene.device);
    scene.shows.value = false;
    flown.fly({ kind: "body", name: "GovDAO" });
    flown.ready();
    run(flown, scene, 4);
    expect(flown.stats().flying).toBe(false);
    expect(away(scene.eye.travel, ZERO)).toBeGreaterThan(10);
    frame(flown, scene);
    expect(away(scene.eye.travel, ZERO)).toBeGreaterThan(10);
    scene.shows.value = true;
    frame(flown, scene);
    expect(scene.eye.travel).toEqual(ZERO);
    expect(scene.eye.look).toBeUndefined();
  });

  it("gives it back after a star's flight too, once the cosmos was hidden and shows again", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    expect(scene.eye.look).toBeDefined();
    scene.shows.value = false;
    frame(flown, scene);
    scene.shows.value = true;
    frame(flown, scene);
    expect(scene.eye.travel).toEqual(ZERO);
    expect(scene.eye.look).toBeUndefined();
  });

  it("leaves the eye where a flight took it while the cosmos stays shown, and lets a flight that brings the cosmos back run", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    const there = { ...scene.eye.travel };
    frame(flown, scene);
    expect(scene.eye.travel).toEqual(there);
    scene.shows.value = false;
    frame(flown, scene);
    flown.fly({ kind: "cosmos", name: "Cosmos" });
    scene.shows.value = true;
    frame(flown, scene);
    expect(flown.stats().flying).toBe(true);
    expect(away(scene.eye.travel, ZERO)).toBeGreaterThan(0);
  });
});

// However a flight's veil ends, what it made is freed: the copied frame, its mesh's geometry and its material; and the flights once gone
// copy nothing on the renderer that went with them (lot B's review, F3719).
describe("what a flight's veil makes, freed however it ends", () => {
  const partsOf = (scene: Rig) => {
    const mesh = scene.stage.children.find(({ name }) => name === "dissolve");
    if (!(mesh instanceof Mesh)) throw new Error("no veil on the stage");
    const { geometry, material } = mesh as Mesh<BufferGeometry, Material>;
    return [freedOn(geometry), freedOn(material)];
  };
  type End = (flown: Flights, scene: Rig) => void;
  const ends: [string, End][] = [
    [
      "it runs its course",
      (flown, scene) => {
        run(flown, scene, 4);
      },
    ],
    [
      "Escape lands the flight",
      (flown, scene) => {
        escape();
        frame(flown, scene);
      },
    ],
    [
      "a press lands it",
      (flown, scene) => {
        press();
        frame(flown, scene);
      },
    ],
    [
      "the flights are disposed mid-way",
      (flown) => {
        flown.dispose();
      },
    ],
  ];

  it.each(ends)("frees the copy, its geometry and its material when %s", (_, end) => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    flown.ready();
    frame(flown, scene);
    const parts = partsOf(scene);
    end(flown, scene);
    expect(parts.map(({ value }) => value)).toEqual([true, true]);
    expect(scene.copies.every((copy) => scene.freed.has(copy))).toBe(true);
    expect(veilOn(scene.stage)).toBe(false);
  });

  it("frees the first flight's veil when a new flight replaces it, and lays the new one's", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    frame(flown, scene);
    const parts = partsOf(scene);
    flown.fly({ kind: "cosmos", name: "Cosmos" });
    expect(parts.map(({ value }) => value)).toEqual([true, true]);
    expect(scene.copies).toHaveLength(2);
    expect(scene.freed.has(scene.copies[0] ?? new FramebufferTexture(1, 1))).toBe(true);
    expect(veilOn(scene.stage)).toBe(true);
  });

  it("frees a crossfade's copy under reduced motion when the flights are disposed mid-fade", () => {
    const scene = rig();
    scene.still.value = true;
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    frame(flown, scene);
    const parts = partsOf(scene);
    flown.dispose();
    expect(parts.map(({ value }) => value)).toEqual([true, true]);
    expect(scene.copies.every((copy) => scene.freed.has(copy))).toBe(true);
    expect(veilOn(scene.stage)).toBe(false);
  });

  it("copies nothing once disposed: a flight asked then renders nothing", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.dispose();
    scene.renderer.render.mockClear();
    flown.fly({ kind: "body", name: "GovDAO" });
    expect(scene.renderer.render).not.toHaveBeenCalled();
    expect(scene.copies).toHaveLength(0);
  });
});

describe("a page's flight", () => {
  it("copies the page it leaves before it goes, crosses the sky along the view, and brings the next body from afar into its place", () => {
    const scene = rig({ yaw: 0.6, pitch: -0.25 });
    const flown = flights(scene.device);
    const forward = new Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion);
    flown.fly({ kind: "body", name: "GovDAO" });
    expect(scene.renderer.render).toHaveBeenCalledTimes(1);
    expect(scene.copies).toHaveLength(1);
    flown.ready();
    const frames: { approach: number; veil: number; streaks: number }[] = [];
    run(flown, scene, {
      seconds: 3.5,
      each: () => {
        frames.push({
          approach: scene.device.arrival.approach,
          veil: flown.stats().veil,
          streaks: flown.stats().streaks,
        });
      },
    });
    const approaches = frames.map(({ approach }) => approach);
    expect(approaches[0]).toBeGreaterThan(4);
    expect(approaches).toEqual([...approaches].sort((a, b) => b - a));
    expect(approaches.at(-1)).toBe(1);
    expect(frames[0]?.veil).toBeGreaterThan(0.8);
    expect(frames.at(-1)?.veil).toBe(0);
    expect(frames.some(({ streaks }) => streaks > 0)).toBe(true);
    expect(frames.at(-1)?.streaks).toBe(0);
    const way = new Vector3(scene.eye.travel.x, scene.eye.travel.y, scene.eye.travel.z);
    expect(way.length()).toBeGreaterThan(10);
    expect(way.normalize().dot(forward)).toBeCloseTo(1, 6);
    expect(scene.eye.look).toBeUndefined();
    expect(flying(scene.said)[0]?.target).toBe("GovDAO");
  });

  // Frame 101 at 42% of the bar: the world banded and large, coming in from the side; frame 36's Earth grown near the end. The body comes
  // from five times its distance and from the left, so it grows and crosses the frame on the way, not in its last few percent; the page
  // it left is gone in the first quarter (the design review's first high, F3706).
  it("brings the next body from five times its distance and from its left, half grown half way, the page it left gone in a quarter", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    flown.ready();
    const frames: { along: number; approach: number; aside: number; veil: number }[] = [];
    run(flown, scene, {
      seconds: 3.5,
      each: () => {
        const { approach, aside } = scene.device.arrival;
        frames.push({ along: flown.stats().along, approach, aside, veil: flown.stats().veil });
      },
    });
    const [first, last] = [frames[0], frames.at(-1)];
    expect(first?.approach).toBeLessThanOrEqual(5);
    expect(first?.aside).toBeLessThan(-1);
    const half = frames.find(({ along }) => along >= 0.5);
    expect(half?.approach).toBeLessThanOrEqual(2);
    expect(half?.aside).toBeGreaterThan(first?.aside ?? 0);
    const asides = frames.map(({ aside }) => aside);
    expect(asides).toEqual([...asides].sort((a, b) => a - b));
    expect(last).toMatchObject({ approach: 1, aside: 0 });
    expect(frames.filter(({ along }) => along >= 0.25).every(({ veil }) => veil === 0)).toBe(true);
    expect(frames.some(({ along, veil }) => along < 0.25 && veil > 0)).toBe(true);
  });

  // The loop holds its full rate while a flight or its veil runs: busy dropped mid-way left a page's flight at 30 frames a second, and a
  // crossfade frozen till some input (lot B's review, F3717).
  it.each([
    ["a page's flight", false],
    ["a crossfade under reduced motion", true],
  ])("is busy on every frame of %s and of its veil, and on none once both are done", (_, still) => {
    const scene = rig();
    scene.still.value = still;
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    flown.ready();
    const frames: { busy: boolean; running: boolean }[] = [];
    run(flown, scene, {
      seconds: 4,
      each: () => {
        const { flying, veil } = flown.stats();
        frames.push({ busy: flown.busy, running: flying || veil > 0 });
      },
    });
    expect(frames.every(({ busy, running }) => busy === running)).toBe(true);
    expect(frames.some(({ busy }) => busy)).toBe(true);
    expect(frames.at(-1)?.busy).toBe(false);
  });

  it("waits in transit while the next body is not drawn, two seconds at most, then lands", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.ready();
    flown.fly({ kind: "body", name: "GovDAO" });
    const { seconds } = flown.stats();
    const held = 0.8251 * seconds;
    run(flown, scene, held + 1.9);
    expect(flown.stats()).toMatchObject({ flying: true });
    expect(flown.stats().along).toBeLessThan(0.83);
    expect(flying(scene.said).at(-1)?.phase).toBe("transit");
    run(flown, scene, 0.2);
    expect(flown.stats().along).toBeGreaterThan(0.83);
    run(flown, scene, (1 - 0.8251) * seconds);
    expect(flown.stats().flying).toBe(false);
    expect(flown.stats().waited).toBeGreaterThanOrEqual(2);
    expect(scene.device.arrival.approach).toBe(1);
  });

  it("enters orbit once the body is drawn", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    const { seconds } = flown.stats();
    run(flown, scene, seconds);
    expect(flown.stats().flying).toBe(true);
    flown.ready();
    run(flown, scene, 0.2 * seconds);
    expect(flown.stats().flying).toBe(false);
    expect(flown.stats().waited).toBeLessThan(2);
  });

  it("comes to the cosmos along the view, back to where the eye rests, its look the view's own", () => {
    const scene = rig({ yaw: -0.4, pitch: 0.2 });
    const flown = flights(scene.device);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    const forward = new Vector3(0, 0, -1).applyQuaternion(scene.camera.quaternion);
    flown.fly({ kind: "cosmos", name: "Cosmos" });
    expect(scene.eye.look).toBeUndefined();
    frame(flown, scene);
    const back = new Vector3(scene.eye.travel.x, scene.eye.travel.y, scene.eye.travel.z);
    expect(back.length()).toBeGreaterThan(10);
    expect(back.normalize().dot(forward)).toBeCloseTo(-1, 6);
    run(flown, scene, 4);
    expect(scene.eye.travel).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("what a flight gives back", () => {
  it.each([
    [
      "landing",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 6);
      },
    ],
    [
      "another flight",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 0.3);
        flown.fly({ kind: "cosmos", name: "Cosmos" });
        run(flown, scene, 6);
      },
    ],
    [
      "Escape",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 0.3);
        escape();
        run(flown, scene, 1);
      },
    ],
    [
      "a click",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 0.3);
        press();
        run(flown, scene, 1);
      },
    ],
    [
      "the longest wait",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 8);
      },
    ],
    [
      "its end",
      (flown: Flights, scene: Rig) => {
        run(flown, scene, 0.3);
        flown.dispose();
      },
    ],
  ])("frees the picture it copied and takes its veil off the stage after %s", (name, end) => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.fly({ kind: "body", name: "GovDAO" });
    if (name !== "the longest wait") flown.ready();
    end(flown, scene);
    expect(scene.copies.length).toBeGreaterThan(0);
    expect(scene.copies.every((copy) => scene.freed.has(copy))).toBe(true);
    expect(veilOn(scene.stage)).toBe(false);
  });

  it("frees every picture of twenty flights there and back, and leaves the stage as it found it", () => {
    const scene = rig();
    const flown = flights(scene.device);
    frame(flown, scene);
    const children = scene.stage.children.length;
    for (let at = 0; at < 20; at += 1) {
      flown.fly(at % 2 === 0 ? { kind: "body", name: "GovDAO" } : { kind: "cosmos", name: "Cosmos" });
      flown.ready();
      run(flown, scene, 4);
    }
    expect(scene.copies).toHaveLength(20);
    expect(scene.freed.size).toBe(20);
    expect(scene.stage.children.length).toBe(children);
  });

  it("compiles its streaks ahead, once, on the stage they are drawn on, says if the compile fails, and flies on", async () => {
    const scene = rig();
    const refused = new Error("no program");
    scene.renderer.compileAsync.mockImplementationOnce(() => Promise.reject(refused));
    const flown = flights(scene.device);
    const streaks = scene.renderer.compileAsync.mock.calls.filter(([object]) => object instanceof LineSegments);
    expect(streaks).toHaveLength(1);
    const [object, camera, target] = streaks[0] ?? [];
    expect(object).toBeInstanceOf(LineSegments);
    expect(camera).toBe(scene.camera);
    expect(target).toBe(scene.stage);
    await Promise.resolve();
    expect(reported).toHaveBeenCalledWith(refused);
    flown.fly({ kind: "star", id: pick(scene).id });
    run(flown, scene, 4);
    expect(flown.stats().flying).toBe(false);
  });

  // A listener left on the window kept a disposed scene alive: none is reached once the flights are gone (lot A's review, F3712).
  it("lets go of the window's keys, presses and clicks once disposed: none of them reads the cosmos or the look", () => {
    const scene = rig();
    const flown = flights(scene.device);
    flown.dispose();
    const cosmos = vi.spyOn(scene.device, "cosmos");
    const look = vi.fn<() => Point | undefined>(() => HOME);
    Object.defineProperty(scene.eye, "look", { get: look, configurable: true });
    escape();
    press();
    click(document.body, WIDTH / 2, HEIGHT / 2);
    expect(cosmos).not.toHaveBeenCalled();
    expect(look).not.toHaveBeenCalled();
  });

  it("takes its streaks off the stage and frees them, frees its veil, and hears no key once disposed", () => {
    const scene = rig();
    const flown = new Flights(scene.device);
    const streaks = scene.stage.children.find((child): child is LineSegments => child instanceof LineSegments);
    const material = streaks?.material;
    const [geometry, shader] = [freedOn(streaks?.geometry), freedOn(Array.isArray(material) ? undefined : material)];
    flown.fly({ kind: "body", name: "GovDAO" });
    run(flown, scene, 0.3);
    flown.dispose();
    expect(scene.stage.children).toHaveLength(0);
    expect([geometry.value, shader.value, scene.freed.size]).toEqual([true, true, 1]);
    escape();
    press();
    expect(flown.stats().flying).toBe(false);
    expect(flown.busy).toBe(false);
  });
});
