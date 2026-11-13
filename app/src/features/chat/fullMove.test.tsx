// @vitest-environment jsdom
import { act, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leaveDock } from "../../fullChat.ts";
import { leaveFull } from "./stillScreen.ts";
import { drawer, noMedia } from "../../../tests/mount.tsx";
import { useFullMove } from "./fullMove.ts";

type Frames = Keyframe[] | PropertyIndexedKeyframes | null;
interface Move {
  target: Element;
  frames: Frames;
  options: KeyframeAnimationOptions | undefined;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
}

function Probe({ full }: { full: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFullMove(ref, full);
  return (
    <div ref={ref} data-chat-screen="">
      <ul data-list="" />
    </div>
  );
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
    animate(this: Element, frames: Frames, options?: KeyframeAnimationOptions) {
      if (throws(this)) throw new Error("no animate");
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const move: Move = { target: this, frames, options, cancel: vi.fn(), finish };
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
const copyMoves = () => moves.filter((move) => move.target.matches("[style*='position: fixed']"));
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
    expect(document.querySelector("[data-chat-screen]")).not.toBeNull();
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

  it("keeps the still copy while the shrink runs on after the fade has ended, and removes it once both end", async () => {
    open();
    render(false);
    const [fade, shrink] = copyMoves();
    await act(async () => {
      fade?.finish();
      await Promise.resolve();
    });
    expect(copies()).toHaveLength(1);
    await act(async () => {
      shrink?.finish();
      await Promise.resolve();
    });
    expect(copies()).toHaveLength(0);
  });

  it("holds the copy's fade and shrink at their last frame until the copy goes", () => {
    open();
    render(false);
    expect(copyMoves().map((move) => move.options?.fill)).toEqual(["forwards", "forwards"]);
  });

  it("puts the copy's scrolled lists back where the screen had them", () => {
    open();
    const list = document.querySelector("[data-list]");
    Object.defineProperty(list, "scrollTop", { value: 42 });
    const scrollTo = vi.fn();
    Object.assign(Element.prototype, { scrollTo });
    render(false);
    expect(scrollTo).toHaveBeenCalledWith({ top: 42 });
  });

  it("shrinks the copy taken before the commit, not the screen as it stands at the close", () => {
    open();
    const screen = document.querySelector<HTMLElement>("[data-chat-screen]");
    const list = screen?.querySelector("[data-list]");
    list?.setAttribute("data-was", "before");
    screen?.setAttribute("data-full", "");
    leaveFull();
    list?.setAttribute("data-was", "after");
    render(false);
    expect(copies()[0]?.querySelector("[data-list]")?.getAttribute("data-was")).toBe("before");
  });

  it("moves nothing under reduced motion, neither the grow nor the shrink", () => {
    document.documentElement.dataset["motion"] = "reduce";
    try {
      open();
      render(false);
      expect(moves).toHaveLength(0);
      expect(copies()).toHaveLength(0);
    } finally {
      delete document.documentElement.dataset["motion"];
    }
  });

  it("grows, but adds no copy at the close, when reduced motion is set after the grow", () => {
    open();
    expect(moves.length).toBeGreaterThan(0);
    document.documentElement.dataset["motion"] = "reduce";
    try {
      render(false);
      expect(copies()).toHaveLength(0);
    } finally {
      delete document.documentElement.dataset["motion"];
    }
  });
});
