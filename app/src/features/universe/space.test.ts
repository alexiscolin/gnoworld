// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// P401: the page that showed space goes, and the moons' asking and looking go with it.
const stopped = vi.hoisted(() => vi.fn());
vi.mock("./moonRooms.ts", () => ({ feedMoons: () => undefined, stopMoons: stopped }));
vi.mock("../../space/scene.ts", () => ({
  Space: class {
    covered = false;
    universe = undefined;
    rig = { flying: false };
    stage = {};
    view = () => undefined;
    go() {
      return false;
    }
    hold = () => undefined;
    worlds = () => undefined;
    plate = () => undefined;
    dispose = () => undefined;
  },
}));
vi.mock("../../earthGround.ts", () => ({ attach: () => undefined }));
vi.mock("../../lenses.ts", () => ({ lightSpace: () => () => undefined }));
vi.mock("./worldsFile.ts", () => ({ worldsFile: () => Promise.resolve(undefined) }));
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
});
