// @vitest-environment jsdom
import {
  orbitPlace,
  plannedOf,
  toScene,
  type Orbiter,
  type Planned,
  type Point,
  type StarSystem,
} from "@gnoworld/core";
import { BufferAttribute, Group, LineSegments, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Orbits, type Words } from "./orbits.ts";

// A system's Plan on the stage (7v; Alexis, 2026-11-03): the only view that draws its orbits, as ellipses, its star at the centre, each world
// with its name under it, in the page's words, and an amber dot where people are; a click names a world, a second goes there.
const system: StarSystem = {
  id: "gnoswap",
  place: { x: 40, y: -2, z: 60 },
  star: 2,
  warmth: 0.5,
  spin: 0,
  tilt: 0.4,
  node: 1.1,
  belt: false,
  worlds: [],
};
const worlds: Orbiter[] = [
  { id: "gnoswap/router", radius: 0.3, orbit: 1.2, phase: 0.4 },
  { id: "gnoswap/pool", radius: 0.4, orbit: 2.4, phase: 2.9 },
  { id: "gnoswap/gov", radius: 0.25, orbit: 3.6, phase: 4.6 },
];
const planned = (): Planned =>
  plannedOf(
    { system, worlds },
    {
      names: new Map(worlds.map(({ id }) => [id, id.split("/").at(-1) ?? id])),
      links: new Map([
        ["gnoswap/router", "/r/gnoswap/v1/router"],
        ["gnoswap/pool", "/r/gnoswap/v1/pool"],
      ]),
    },
  );
// The file's words: two people in pool, its realms none of the Plan's own links.
const signalsWith = (here: number) => ({
  present: new Map([["gnoswap/pool", { here, perHour: 0, rise: null }]]),
  names: new Map<string, string>(),
  visited: () => false,
  now: 0,
});
const words: Words = { worlds: [], signals: signalsWith(2) };
// The bodies' projection, as the cosmos's: the stage less the eye, then a fixed screen of 1,000 by 1,000 pixels.
const projector = {
  fromEye: (place: Point, eye: Point, out: Vector3) => {
    const at = { x: 0, y: 0, z: 0 };
    toScene(place, at);
    return out.set(at.x - eye.x, at.y - eye.y, at.z - eye.z);
  },
  seen: (at: Vector3, radius: number) => ({
    x: 500 + 10 * at.x,
    y: 500 - 10 * at.y,
    radius: 10 * radius,
    depth: -at.z,
  }),
};
const made = () => {
  const parent = new Group();
  const open = vi.fn<(href: string) => void>();
  const orbits = new Orbits(parent, document, { projector, open });
  return { parent, orbits, open };
};
const names = () => [...document.querySelectorAll<HTMLAnchorElement>("[data-plan] a")];

afterEach(() => {
  document.body.replaceChildren();
});

describe("a system's Plan on the stage", () => {
  it("draws one ellipse round the star for each world's orbit, in the system's plane, all in one draw", () => {
    const { parent, orbits } = made();
    orbits.show(planned(), words);
    const lines = parent.children.filter((child): child is LineSegments => child instanceof LineSegments);
    expect(lines).toHaveLength(1);
    const position = lines[0]?.geometry.getAttribute("position") as BufferAttribute;
    expect(position.count % (2 * worlds.length)).toBe(0);
    // The plane's normal on the stage: the map's turned as toScene turns it.
    const [origin, up] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];
    toScene({ x: 0, y: 0, z: 0 }, origin);
    toScene(
      {
        x: -Math.sin(system.node) * Math.sin(system.tilt),
        y: Math.cos(system.tilt),
        z: Math.cos(system.node) * Math.sin(system.tilt),
      },
      up,
    );
    const normal = new Vector3(up.x - origin.x, up.y - origin.y, up.z - origin.z);
    const each = position.count / worlds.length;
    // A closed loop of 64 segments or more each: every segment starts where the one before ended, the last ends at the first.
    expect(each).toBeGreaterThanOrEqual(128);
    for (let ring = 0; ring < worlds.length; ring += 1) {
      const vertex = (at: number) => new Vector3().fromBufferAttribute(position, ring * each + at);
      for (let at = 2; at < each; at += 2) expect(vertex(at).distanceTo(vertex(at - 1))).toBeLessThan(1e-6);
      expect(vertex(each - 1).distanceTo(vertex(0))).toBeLessThan(1e-6);
    }
    worlds.forEach(({ orbit }, ring) => {
      for (let at = ring * each; at < (ring + 1) * each; at += 1) {
        // Round the star, which the ellipses' own place stands at: its orbit's radius, in the plane its world turns in.
        const vertex = new Vector3().fromBufferAttribute(position, at);
        expect(vertex.length()).toBeCloseTo(orbit, 4);
        expect(vertex.dot(normal)).toBeCloseTo(0, 4);
      }
    });
  });

  it("stands its ellipses round the star as the eye moves: the star less the eye", () => {
    const { parent, orbits } = made();
    orbits.show(planned(), words);
    const eye = { x: 3, y: -1, z: 7 };
    orbits.tick(eye);
    const [lines] = parent.children;
    const star = { x: 0, y: 0, z: 0 };
    toScene(system.place, star);
    expect(lines?.position.toArray()).toEqual([star.x - eye.x, star.y - eye.y, star.z - eye.z]);
  });

  it("names each world under it, in the page's words, a link to its page where it has one, an amber dot where people are", () => {
    const { orbits } = made();
    orbits.show(planned(), words);
    orbits.tick({ x: 0, y: 0, z: 0 });
    expect(names().map(({ textContent }) => textContent)).toEqual(["router", "pool", "gov"]);
    expect(names().map((name) => name.getAttribute("href"))).toEqual([
      "/r/gnoswap/v1/router",
      "/r/gnoswap/v1/pool",
      null,
    ]);
    expect(names().map((name) => name.querySelector(".dot[data-tone='warm']") !== null)).toEqual([false, true, false]);
    worlds.forEach((world, at) => {
      const place = { x: NaN, y: NaN, z: NaN };
      orbitPlace({ system, world }, 0, place);
      const spot = projector.seen(projector.fromEye(place, { x: 0, y: 0, z: 0 }, new Vector3()), world.radius);
      const [x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(names()[at]?.style.transform ?? "")?.slice(1) ?? [];
      // Written to a tenth of a pixel, as the labels are.
      expect(Math.abs(Number(x) - spot.x)).toBeLessThanOrEqual(0.05);
      expect(Number(y)).toBeGreaterThan(spot.y + spot.radius);
    });
  });

  // A click the browser would follow, cancelable as a real one: whether it was kept from going.
  const clicked = (name: Element | undefined, init: MouseEventInit = {}) => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    name?.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("names a world at a first click and goes to its page at a second, through the page's router", () => {
    const { orbits, open } = made();
    orbits.show(planned(), words);
    const [router, pool] = names();
    expect(clicked(router)).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(router?.getAttribute("aria-current")).toBe("true");
    expect(clicked(pool)).toBe(true);
    expect(router?.getAttribute("aria-current")).toBeNull();
    expect(pool?.getAttribute("aria-current")).toBe("true");
    expect(clicked(pool)).toBe(true);
    expect(open).toHaveBeenCalledWith("/r/gnoswap/v1/pool");
  });

  it("opens a hand-made project's own address in a tab of its own at a second click, never at the first, never through the router", () => {
    const { orbits, open } = made();
    orbits.show({ ...planned(), links: new Map([["gnoswap/gov", "https://gnosh.ai"]]) }, words);
    const gov = names()[2];
    expect(gov?.getAttribute("target")).toBe("_blank");
    expect(gov?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(clicked(gov)).toBe(true);
    expect(clicked(gov)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  // A click with a modifier or the middle button is the reader's own way to a new tab: the browser keeps it, nothing is named.
  it("leaves a click with a modifier or the middle button to the browser, naming nothing", () => {
    const { orbits, open } = made();
    orbits.show(planned(), words);
    const [router] = names();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }])
      expect(clicked(router, init)).toBe(false);
    expect(router?.getAttribute("aria-current")).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it("links no address but the site's own pages and https, and names hostile words as words", () => {
    const { orbits, open } = made();
    const hostile = [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.example/",
      "/\\evil.example",
      "http://gnosh.ai",
      "/r/a b",
      "",
    ];
    orbits.show(
      plannedOf(
        { system, worlds: hostile.map((_, at) => ({ id: `w${String(at)}`, radius: 0.2, orbit: 1 + at, phase: at })) },
        {
          names: new Map(
            hostile.map((_, at) => [`w${String(at)}`, at === 0 ? "<img src=x onerror=alert(1)>" : `w${String(at)}`]),
          ),
          links: new Map(hostile.map((href, at) => [`w${String(at)}`, href])),
        },
      ),
      words,
    );
    expect(names().every((name) => !name.hasAttribute("href") && !name.hasAttribute("target"))).toBe(true);
    expect(document.querySelector("[data-plan] img")).toBeNull();
    expect(names()[0]?.textContent).toBe("<img src=x onerror=alert(1)>");
    for (const name of names()) {
      clicked(name);
      clicked(name);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("hides the name of a world behind the eye, and draws one set of names however often it is shown the same Plan", () => {
    const { orbits } = made();
    const plan = planned();
    orbits.show(plan, words);
    orbits.show(plan, words);
    orbits.show({ ...plan }, words);
    expect(names()).toHaveLength(worlds.length);
    // The eye past every world along the stage's depth, which stand near its z of -2,170: each behind it.
    orbits.tick({ x: 0, y: 0, z: -5000 });
    expect(names().every((name) => name.hidden)).toBe(true);
    orbits.tick({ x: 0, y: 0, z: 0 });
    expect(names().some((name) => !name.hidden)).toBe(true);
  });

  // The Plan's names in the file's words (7v's placement): a world's page from its first realm where the Plan knows none, the page's name,
  // who is here; read again when the file's words change under the same Plan.
  it("names and links a world in the file's words, and reads them again when they change under the same Plan", () => {
    const { orbits } = made();
    const plan = plannedOf({ system, worlds }, { names: new Map([["gnoswap/router", "router"]]), links: new Map() });
    const file = [
      { id: "gnoswap/router", namespace: "gnoswap", realms: [{ callers: 3, path: "gno.land/r/gnoswap/v1/router" }] },
      { id: "gnoswap/pool", namespace: "gnoswap", realms: [{ callers: 1, path: "gno.land/p/gnoswap/pool" }] },
    ];
    const named = { ...signalsWith(0), names: new Map([["gnoswap/gov", "Governance"]]) };
    orbits.show(plan, { worlds: file, signals: named });
    expect(names().map(({ textContent }) => textContent)).toEqual(["router", "gnoswap/pool", "Governance"]);
    expect(names().map((name) => name.getAttribute("href"))).toEqual(["/r/gnoswap/v1/router", null, null]);
    expect(names().some((name) => name.querySelector(".dot") !== null)).toBe(false);
    orbits.show(plan, { worlds: file, signals: { ...named, present: signalsWith(1).present } });
    expect(names().map((name) => name.querySelector(".dot[data-tone='warm']") !== null)).toEqual([false, true, false]);
  });

  // 7v's review (F4454): the universe stays on the page across routes, so a Plan's layer that ignored the canvas stayed over a realm's page,
  // its links clickable; with no Plan, an empty landmark stayed for a screen reader.
  it("shows its layer only while a Plan is shown and the scene's canvas runs", async () => {
    const canvas = document.createElement("canvas");
    canvas.dataset["scene"] = "on";
    document.body.append(canvas);
    const { orbits } = made();
    const layer = () => document.querySelector<HTMLElement>("[data-plan]");
    expect(layer()?.hidden).toBe(true);
    orbits.show(planned(), words);
    orbits.tick({ x: 0, y: 0, z: 0 });
    expect(layer()?.hidden).toBe(false);
    canvas.dataset["scene"] = "covered";
    await Promise.resolve();
    expect(layer()?.hidden).toBe(true);
    orbits.tick({ x: 0, y: 0, z: 0 });
    expect(layer()?.hidden).toBe(true);
    canvas.dataset["scene"] = "on";
    await Promise.resolve();
    orbits.tick({ x: 0, y: 0, z: 0 });
    expect(layer()?.hidden).toBe(false);
    orbits.show(undefined, words);
    expect(layer()?.hidden).toBe(true);
    orbits.dispose();
  });

  it("takes its ellipses and names away once no Plan is shown, and everything once gone", () => {
    const { parent, orbits } = made();
    orbits.show(planned(), words);
    orbits.show(undefined, words);
    expect(parent.children.every((child) => !child.visible)).toBe(true);
    expect(names()).toEqual([]);
    orbits.show(planned(), words);
    orbits.dispose();
    expect(parent.children).toEqual([]);
    expect(document.querySelector("[data-plan]")).toBeNull();
  });
});
