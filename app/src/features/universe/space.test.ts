// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// P401: the page that showed space goes, and the moons' asking and looking go with it.
const stopped = vi.hoisted(() => vi.fn());
const flies = vi.hoisted(() => ({ on: false }));
vi.mock("./moonRooms.ts", () => ({ feedMoons: () => undefined, stopMoons: stopped }));
vi.mock("../../space/scene.ts", () => ({
  Space: class {
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
vi.mock("./worldsFile.ts", () => ({ worldsFile: () => new Promise(() => undefined) }));
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
    await new Promise((done) => setTimeout(done, 50));
    release();
    expect(stopped).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(stopped).toHaveBeenCalledTimes(1);
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
    await new Promise((done) => setTimeout(done, 50));
    const box = document.createElement("div");
    box.dataset["globe"] = "";
    box.dataset["flown"] = "landed";
    document.body.append(box);
    syncFlown();
    expect(box.dataset["flown"]).toBe("flying");
  });
});
