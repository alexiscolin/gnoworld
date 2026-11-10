// @vitest-environment jsdom
import { act, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leaveDock } from "../../fullChat.ts";
import { drawer, noMedia } from "../../../tests/mount.tsx";
import { useFullMove } from "./fullMove.ts";

type Frames = Keyframe[] | PropertyIndexedKeyframes | null;
interface Move {
  target: Element;
  frames: Frames;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
}

function Probe({ full }: { full: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFullMove(ref, full);
  return <div ref={ref} data-chat-screen="" />;
}

const control = document.createElement("button");
let draw: ReturnType<typeof drawer>;
let moves: Move[];
let throws: (target: Element) => boolean;

beforeEach(() => {
  noMedia();
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => {
    run();
    return 0;
  });
  vi.stubGlobal("reportError", vi.fn());
  moves = [];
  throws = () => false;
  Object.assign(Element.prototype, {
    animate(this: Element, frames: Frames) {
      if (throws(this)) throw new Error("no animate");
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const move: Move = { target: this, frames, cancel: vi.fn(), finish };
      moves.push(move);
      return { finished, playState: "running", cancel: move.cancel };
    },
  });
  draw = drawer();
});

afterEach(() => {
  // The probe goes while the page's stubs still stand (its leaving runs a shrink), then the still copies left in the page.
  draw(null);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const render = (full: boolean) => {
  draw(<Probe full={full} />);
};
const open = () => {
  render(false);
  leaveDock(control);
  render(true);
};
const copies = () => [...document.body.querySelectorAll(":scope > [style*='position: fixed']")];

describe("the full chat's move", () => {
  it("removes the still copy once the shrink ends", async () => {
    open();
    render(false);
    expect(copies()).toHaveLength(1);
    await act(async () => {
      moves
        .filter((move) => move.target.matches("[style*='position: fixed']"))
        .forEach((move) => {
          move.finish();
        });
      await Promise.resolve();
    });
    expect(copies()).toHaveLength(0);
  });

  it("removes the still copy, and keeps the chat standing, when animate throws", () => {
    open();
    throws = (target) => !target.hasAttribute("data-chat-screen");
    render(false);
    expect(copies()).toHaveLength(0);
    expect(reportError).toHaveBeenCalled();
  });

  it("keeps the chat standing when animate throws at the grow", () => {
    throws = () => true;
    open();
    expect(document.querySelector("[data-chat-screen]")).not.toBeNull();
    expect(reportError).toHaveBeenCalled();
  });

  it("closes in the middle of the grow from where the grow stood: its moves cancelled, the shrink's first keyframes the shown clip and opacity", () => {
    open();
    const screen = document.querySelector<HTMLElement>("[data-chat-screen]");
    const grow = moves.filter((move) => move.target === screen);
    expect(grow.length).toBeGreaterThan(0);
    screen?.style.setProperty("clip-path", "inset(10px 20px 30px 40px round 16px)");
    screen?.style.setProperty("opacity", "0.5");
    render(false);
    grow.forEach((move) => {
      expect(move.cancel).toHaveBeenCalled();
    });
    const shrink = moves.filter((move) => move.target !== screen);
    const all = shrink.flatMap((move) => (Array.isArray(move.frames) ? move.frames : []));
    expect(all.find((frame) => frame.offset === 0 && "clipPath" in frame)?.["clipPath"]).toBe(
      "inset(10px 20px 30px 40px round 16px)",
    );
    expect(all.find((frame) => frame.offset === 0 && "opacity" in frame)?.["opacity"]).toBe(0.5);
  });
});
