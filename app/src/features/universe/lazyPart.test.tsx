// @vitest-environment jsdom
import { act, Suspense } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { lazyPart } from "./lazyPart.ts";

// A part of the universe's page in a chunk of its own (the Earth's signs, a world's moons, the cosmos's rail): drawn once its chunk comes;
// a chunk that does not come draws nothing and throws nothing to a root that has no error boundary.
describe("a lazy part of the universe's page", () => {
  it("draws the part its chunk brings", async () => {
    const Part = lazyPart<{ readonly word: string }>(() => Promise.resolve(({ word }) => <p>{word}</p>));
    const box = mount(
      <Suspense fallback={null}>
        <Part word="here" />
      </Suspense>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(box.textContent).toBe("here");
  });

  it("draws nothing, and leaves what stands beside it, when its chunk does not come", async () => {
    const Part = lazyPart<object>(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    const box = mount(
      <>
        <canvas />
        <Suspense fallback={null}>
          <Part />
        </Suspense>
      </>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(box.querySelector("canvas")).not.toBeNull();
    expect(box.textContent).toBe("");
  });
});
