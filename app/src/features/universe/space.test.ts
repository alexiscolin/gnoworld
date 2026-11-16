// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// The page that showed space goes, and the moons' asking and looking go with it.
const stopped = vi.hoisted(() => vi.fn());
const flies = vi.hoisted(() => ({ on: false }));
// Set once the engine's chunk has come and the page has made its Space.
const made = vi.hoisted(() => ({ on: false }));
const fed = vi.hoisted(() => vi.fn());
vi.mock("./moonRooms.ts", () => ({ feedMoons: fed, stopMoons: stopped }));
vi.mock("../../space/scene.ts", () => ({
  Space: class {
    constructor() {
      made.on = true;
    }
    covered = false;
    universe = undefined;
    rig = { flying: false };
    stage = {};
    view = () => undefined;
    go() {
      return flies.on;
    }
    hold = () => undefined;
    worlds = () => undefined;
    plate = () => undefined;
    dispose = () => undefined;
  },
}));
vi.mock("../../earthGround.ts", () => ({ attach: () => undefined }));
vi.mock("../../lenses.ts", () => ({ lightSpace: () => () => undefined }));
vi.mock("./spaceHook.ts", () => ({ exposeSpace: () => undefined }));
vi.mock("../../mapView.ts", () => ({ isMap: () => false, onMap: () => () => undefined }));
vi.mock("../../worldsFile.ts", () => ({ worldsFile: () => new Promise(() => undefined) }));
vi.mock("./arrival.ts", () => ({ enterPage: () => undefined, landTags: () => undefined, waitTags: () => undefined }));

describe("release", () => {
  it("stops the moons' feed once the page's commit is done and no page asked space again", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { offer, release, show } = await import("./space.ts");
    offer.state = "taken";
    show({ kind: "universe" }, () => undefined);
    await vi.waitFor(() => {
      expect(made.on).toBe(true);
    });
    release();
    expect(stopped).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  // A page that asks for no space (an error, the full chat) covers it: nothing looks at the moons then, so their asking stops too.
  it("stops the moons' feed when a page asks for no place, space being covered", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { offer, show } = await import("./space.ts");
    offer.state = "taken";
    show({ kind: "universe" }, () => undefined);
    await vi.waitFor(() => {
      expect(made.on).toBe(true);
    });
    stopped.mockClear();
    show(undefined, () => undefined);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it("feeds the moons again when a page asks for a place after one that asked for none", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { offer, show } = await import("./space.ts");
    offer.state = "taken";
    show({ kind: "universe" }, () => undefined);
    await vi.waitFor(() => {
      expect(made.on).toBe(true);
    });
    show(undefined, () => undefined);
    fed.mockClear();
    show({ kind: "universe" }, () => undefined);
    expect(fed).toHaveBeenCalledTimes(1);
  });

  // A page's planet box that mounts after the flight began (its route's chunk comes late) takes the flight's state: the page's parts wait out of
  // sight in it (globe.module.css), never standing in full view while the camera still flies.
  it("gives a box that mounts after the flight began the flight's state", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.stubGlobal("reportError", () => undefined);
    const { offer, show, syncFlown } = await import("./space.ts");
    offer.state = "taken";
    flies.on = true;
    show({ kind: "world", id: "bubble" }, () => undefined);
    await vi.waitFor(() => {
      expect(made.on).toBe(true);
    });
    const box = document.createElement("div");
    box.dataset["globe"] = "";
    box.dataset["flown"] = "landed";
    document.body.append(box);
    syncFlown();
    expect(box.dataset["flown"]).toBe("flying");
  });
});
