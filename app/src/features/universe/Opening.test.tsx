// @vitest-environment jsdom
import { DIVE } from "@gnoworld/core";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, one } from "../../../tests/mount.tsx";
import type { SceneStatus } from "./host.ts";
import { OPENING_MOST, Opening } from "./Opening.tsx";

// The home's opening (ADR-0003 §1): the words over the dive, no click asked. They stay while the 3D loads and leave as the camera lands,
// which the scene's canvas says (data-dive); a click, a key or the wheel shortens them. Shown, the device keeps it, so nothing shows twice.
const canvasRef = () => {
  const ref = createRef<HTMLCanvasElement>();
  const canvas = document.createElement("canvas");
  canvas.dataset["scene"] = "loading";
  document.body.append(canvas);
  Object.assign(ref, { current: canvas });
  return { ref, canvas };
};
const opened = (status: SceneStatus = "loading") => {
  const { ref, canvas } = canvasRef();
  const box = mount(<Opening canvas={ref} status={status} />);
  return { box, canvas, words: () => one(box, "[data-opening]") };
};
const left = (words: HTMLElement) => words.hasAttribute("data-left");

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  document.body.replaceChildren();
});

describe("the opening's words", () => {
  it("says what gnoworld is, in three lines, and offers what gno.land is in a new tab", () => {
    const { words } = opened();
    expect([...words().querySelectorAll("p")].map((line) => line.textContent)).toEqual([
      "gno.world",
      "The living map of gno.land.",
      "Every realm is a world. Discover what's being built, follow what's trending, and talk with the people building it.",
    ]);
    const link = one(words(), "a");
    expect(link.textContent).toBe("What is gno.land?");
    expect(link.getAttribute("href")).toBe("https://gno.land");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual(["noopener", "noreferrer"]);
  });

  it("is kept on the device as it shows", () => {
    expect(localStorage.getItem("gnoworld:opened")).toBeNull();
    opened();
    expect(localStorage.getItem("gnoworld:opened")).toBe("1");
  });

  it("stays while the 3D loads, however long", () => {
    const { words } = opened("loading");
    act(() => {
      vi.advanceTimersByTime(10 * OPENING_MOST);
    });
    expect(left(words())).toBe(false);
  });
});

// F4529, mock-up 1: "The hero, the labels and the buttons come as the camera lands": the hero gives way while the words show, and comes
// back as they leave; it stays the page's reading (its heading a screen reader's), so it is never inert.
describe("the hero under the opening", () => {
  const hero = () => {
    const box = document.createElement("div");
    box.dataset["yield"] = "none";
    document.body.append(box);
    return box;
  };

  it("gives way while the words show, still the page's reading, and comes back as they leave", () => {
    const box = hero();
    opened("loading");
    expect(box.dataset["yield"]).toBe("opening");
    expect(box.hasAttribute("inert")).toBe(false);
    act(() => {
      document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    });
    expect(box.dataset["yield"]).toBe("none");
    expect(box.hasAttribute("inert")).toBe(false);
  });

  // F4648: on a phone the page's list of worlds stands under the hero, where the words come: it gives way with it.
  it("gives way with every part of the page that stands where the words come, the list of worlds beside the hero", () => {
    const [box, list] = [hero(), hero()];
    opened("loading");
    expect([box.dataset["yield"], list.dataset["yield"]]).toEqual(["opening", "opening"]);
    act(() => {
      document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    });
    expect([box.dataset["yield"], list.dataset["yield"]]).toEqual(["none", "none"]);
  });

  it("comes back if the words go with their page", () => {
    const box = hero();
    const { ref } = canvasRef();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<Opening canvas={ref} status="loading" />);
    });
    expect(box.dataset["yield"]).toBe("opening");
    act(() => {
      root.unmount();
    });
    expect(box.dataset["yield"]).toBe("none");
    expect(box.hasAttribute("inert")).toBe(false);
  });
});

describe("the opening's end", () => {
  it("leaves as the scene's canvas says the camera landed", async () => {
    vi.useRealTimers();
    const { canvas, words } = opened("on");
    expect(left(words())).toBe(false);
    act(() => {
      canvas.dataset["dive"] = "landed";
    });
    await vi.waitFor(() => {
      expect(left(words())).toBe(true);
    });
  });

  it("leaves at once where the camera landed before it came", () => {
    const { ref, canvas } = canvasRef();
    canvas.dataset["dive"] = "landed";
    const box = mount(<Opening canvas={ref} status="on" />);
    expect(left(one(box, "[data-opening]"))).toBe(true);
  });

  it.each([
    ["a click", () => new PointerEvent("pointerdown", { bubbles: true })],
    ["a key", () => new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })],
    ["a letter", () => new KeyboardEvent("keydown", { bubbles: true, key: "a" })],
    ["the wheel", () => new WheelEvent("wheel", { bubbles: true, deltaY: 40 })],
  ])("leaves at %s, while the 3D still loads", (_, event) => {
    const { words } = opened("loading");
    act(() => {
      document.body.dispatchEvent(event());
    });
    expect(left(words())).toBe(true);
  });

  // F4505: Tab moves the focus, which may be on its way to the opening's link: it keeps the words, and the focus in them holds them.
  it("keeps the words at Tab, so the keyboard reaches its link", () => {
    const { words } = opened("loading");
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    });
    expect(left(words())).toBe(false);
  });

  // F4519: a browser sends the modifier's own keydown before the key it changes: Shift then Tab, as a keyboard goes back.
  it.each(["Shift", "Control", "Alt", "Meta"])(
    "keeps the words at %s pressed alone, as before a Tab it changes",
    (key) => {
      const { words } = opened("loading");
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Tab", shiftKey: key === "Shift" }),
        );
      });
      expect(left(words())).toBe(false);
    },
  );

  // F4520: the words' observer of the canvas lets go as they leave.
  it("lets the canvas go as the words leave", () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const { words } = opened("on");
    expect(disconnect).not.toHaveBeenCalled();
    act(() => {
      document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    });
    expect(left(words())).toBe(true);
    expect(disconnect).toHaveBeenCalled();
  });

  it("holds while the focus is on its link, and leaves as the focus goes", async () => {
    vi.useRealTimers();
    const { canvas, words } = opened("on");
    const link = one(words(), "a");
    act(() => {
      link.focus();
      canvas.dataset["dive"] = "landed";
    });
    await new Promise((done) => setTimeout(done, 20));
    expect(left(words())).toBe(false);
    act(() => {
      link.blur();
    });
    expect(left(words())).toBe(true);
  });

  it("keeps the words at a press on its own link, whose click opens gno.land", () => {
    const { words } = opened("loading");
    const link = one(words(), "a");
    act(() => {
      link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(left(words())).toBe(false);
    const opening = vi.fn((event: Event) => {
      event.preventDefault();
    });
    link.addEventListener("click", opening);
    link.click();
    expect(opening).toHaveBeenCalledOnce();
  });

  it("takes no focus and no pointer once it left", () => {
    const { words } = opened("loading");
    expect(words().hasAttribute("inert")).toBe(false);
    act(() => {
      document.body.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 40 }));
    });
    expect(words().hasAttribute("inert")).toBe(true);
  });

  // F4510: its longest wait is the dive's own, waiting for the whole cosmos and flying down, and a second: core's, which the opening keeps
  // as a number so the first screen holds none of the dive's code.
  it("waits as long as the dive itself could take, and a second", () => {
    expect(OPENING_MOST).toBe((DIVE.wait + DIVE.seconds + 1) * 1000);
  });

  it("leaves once the scene ran its longest wait for a landing that never came", () => {
    const { words } = opened("on");
    act(() => {
      vi.advanceTimersByTime(OPENING_MOST - 1);
    });
    expect(left(words())).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(left(words())).toBe(true);
  });
});
