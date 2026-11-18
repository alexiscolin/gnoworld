import { DirectionalLight, Group, Mesh, PerspectiveCamera, Scene } from "three";
import { describe, expect, it } from "vitest";
import type { Planet } from "../layout.ts";
import type { Planet as Drawn } from "../planet/planet.ts";
import type { PlateMask } from "../planet/plateMask.ts";
import { holdOf } from "./held.ts";

// A renderer that records, for each compile, whether the tree compiled showed then and stood apart from the stage: three counts a lamp
// only in a tree that shows, once in the stage and once more in the tree compiled (WebGLRenderer.compile gathers the lights of both by
// traverseVisible), and keys every program of the tree by the count.
function renderer() {
  const shown: string[] = [];
  const compile = (root: Group): void => {
    shown.push(`${root.visible ? "shown" : "hidden"} ${root.parent === null ? "apart" : "on the stage"}`);
  };
  return {
    shown,
    gl: {
      getContext: () => ({ getContextAttributes: () => ({ antialias: false }) }),
      getRenderTarget: () => null,
      setRenderTarget: () => undefined,
      compile,
      compileAsync: (root: Group) => {
        compile(root);
        return Promise.resolve();
      },
    },
  };
}

describe("holdOf", () => {
  // gnosh's colony carries its own lamp (colony/gnoshColony.ts): compiled hidden, its programs were keyed with no lamp, never used, and
  // made again on the frame it first showed (the system to the Earth: 5 programs linked in the flight, dive-smooth's measure).
  it("compiles a planet while its tree shows, apart from the stage, so a lamp it carries counts once; then hides it on the stage", () => {
    const group = new Group().add(new Mesh(), new DirectionalLight());
    const drawn = { group, setPlate: () => undefined } as unknown as Drawn;
    const { gl, shown } = renderer();
    const stage = new Scene();
    const held = holdOf(drawn, {} as Planet, {
      stage,
      renderer: gl as never,
      camera: new PerspectiveCamera(),
      plate: {} as PlateMask,
    });
    expect(shown).toEqual(["shown apart", "shown apart"]);
    expect([group.visible, group.parent]).toEqual([false, stage]);
    expect(held.shown).toBe(false);
  });
});
