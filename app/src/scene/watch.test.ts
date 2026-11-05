// @vitest-environment jsdom
import { SNAPSHOT_EVENT, SNAPSHOT_TAKEN } from "@gnoworld/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Drawn, recordDrawing } from "../../tests/drawing.ts";
import { FakeClock } from "../../tests/fakeClock.ts";
import { noMedia } from "../../tests/mount.tsx";
import { FrameLoop } from "./loop.ts";
import { watchScene } from "./watch.ts";

// A share asks the scene for its view as an event on the canvas: the scene answers on that canvas, with a copy of it, until its signal aborts.
let drawn: Drawn[];
let restore: () => void;
beforeEach(() => {
  ({ drawn, restore } = recordDrawing());
  noMedia();
  vi.stubGlobal("reportError", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      disconnect = () => undefined;
    },
  );
});
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
});

function watched() {
  const clock = new FakeClock(60);
  const loop = new FrameLoop(clock, () => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 150;
  const stop = new AbortController();
  watchScene(
    canvas,
    {
      loop,
      eye: { aim: () => undefined, hold: () => undefined },
      changed: () => undefined,
      resized: () => undefined,
      lost: () => undefined,
    },
    stop.signal,
  );
  const answers: unknown[] = [];
  canvas.addEventListener(SNAPSHOT_TAKEN, (answer) => {
    answers.push(answer instanceof CustomEvent ? answer.detail : undefined);
  });
  const settle = async (ms: number) => {
    clock.run(ms);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { canvas, stop, answers, settle };
}

describe("the scene's answer to a share", () => {
  it("is the next frame's copy of its canvas, said on that canvas", async () => {
    const { canvas, answers, settle } = watched();
    canvas.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT));
    expect(answers).toHaveLength(0);
    await settle(100);
    expect(answers).toHaveLength(1);
    expect(drawn).toEqual([{ onto: answers[0], from: canvas, width: canvas.width, height: canvas.height }]);
  });

  it("is none once the signal aborts", async () => {
    const { canvas, stop, answers, settle } = watched();
    stop.abort();
    canvas.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT));
    await settle(100);
    expect(answers).toHaveLength(0);
    expect(drawn).toHaveLength(0);
  });
});
