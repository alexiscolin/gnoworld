// @vitest-environment jsdom
import { PerspectiveCamera, type Object3D } from "three";
import { expect, it } from "vitest";
import { layoutOf } from "./layout.ts";
import { warmPrograms } from "./parts/programs.ts";
import { Stage } from "./stage.ts";

// three frees a program once the last material that used it is disposed: a universe laid again (a page's world the file lacks) made new
// materials and disposed the last ones before a frame drew the new, so the planets', the suns' and the dust's programs were linked anew,
// in the flight to that world (8 programs, dive-smooth's measure).
function laidTwice(warmed: boolean): string[] {
  const stage = new Stage({ base: "/", still: () => false });
  const order: string[] = [];
  const renderer = {
    getContext: () => ({ getContextAttributes: () => ({ antialias: false }) }),
    getRenderTarget: () => null,
    setRenderTarget: () => undefined,
    compile: (root: Object3D) => {
      if (root === stage.planets?.mesh) order.push("compile");
    },
  };
  const device = { renderer: renderer as never, camera: new PerspectiveCamera() };
  stage.stand(layoutOf([]), device);
  expect(order).toEqual([]);
  if (warmed) warmPrograms({ ...device, stage: stage.scene });
  order.length = 0;
  stage.planets?.mesh.material.addEventListener("dispose", () => order.push("dispose"));
  stage.stand(layoutOf([]), device);
  stage.dispose();
  return order;
}

it("makes a universe laid again its programs before the last one's parts go, once the programs were made", () => {
  const order = laidTwice(true);
  expect(order.slice(0, 2)).toEqual(["compile", "compile"]);
  expect(order.indexOf("dispose")).toBe(order.lastIndexOf("compile") + 1);
});

// Before the first rest (a page opened on a world the file lacks) and in the chat's small view, the last parts hold no program to keep:
// making the stage's there would link them all before the first screen.
it("makes none for a universe laid again before the programs were made", () => {
  expect(laidTwice(false).filter((step) => step === "compile")).toEqual([]);
});
