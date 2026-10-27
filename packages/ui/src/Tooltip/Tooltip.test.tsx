import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staysText } from "../testing.tsx";
import { Tooltip } from "./Tooltip.tsx";

// The words, found by their text: hidden from assistive technology, they have no role.
const tip = () => screen.getByText("Search the universe");
const shown = () => tip().closest("[data-shown]")?.getAttribute("data-shown");
const button = () => screen.getByRole("button");

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// The focus the keyboard brings: Tab first, as jsdom's :focus-visible reads the events before the
// focus, and whatever an earlier test of the file left would answer otherwise.
function keyboardFocus() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab" });
  act(() => {
    button().focus();
  });
}

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const draw = () =>
    render(
      <>
        <Tooltip label="Search the universe">
          <button type="button" aria-label="Search the universe" />
        </Tooltip>
        <input aria-label="Elsewhere" />
      </>,
    );

  it("shows its words half a second after the pointer comes, not before, and hides them when it goes", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(499);
    expect(shown()).toBe("false");
    advance(1);
    expect(shown()).toBe("true");
    fireEvent.pointerLeave(button());
    expect(shown()).toBe("false");
  });

  it("never shows them when the pointer goes before its half second", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(100);
    fireEvent.pointerLeave(button());
    advance(1_000);
    expect(shown()).toBe("false");
  });

  it("keeps them while the pointer moves onto them", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(500);
    fireEvent.pointerLeave(button(), { relatedTarget: tip() });
    expect(shown()).toBe("true");
  });

  it("shows them at once when the keyboard brings the focus, and hides them when it leaves", () => {
    draw();
    keyboardFocus();
    expect(shown()).toBe("true");
    act(() => {
      button().blur();
    });
    expect(shown()).toBe("false");
  });

  // F832: Chrome refuses to show a popover inside another popover's show or hide: a menu closed by Esc hands the focus
  // back to its trigger, this tooltip's control, during its hide. The words show on the next frame, placed then.
  const refusing = (error: Error) => {
    const words = tip();
    const toggle = words.togglePopover.bind(words);
    let refused = 0;
    vi.spyOn(words, "togglePopover").mockImplementation((force) => {
      if (force !== true || refused > 0) return toggle(force);
      refused += 1;
      throw error;
    });
    return () => refused;
  };

  it("shows its words on the next frame when the browser refuses them during another popover's toggle (F832)", () => {
    draw();
    const refused = refusing(
      new DOMException("Invalid to show a popover during another show operation", "InvalidStateError"),
    );
    keyboardFocus();
    expect(refused()).toBe(1);
    expect(tip().style.display).not.toBe("block");
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(tip().style.display).toBe("block");
    vi.restoreAllMocks();
  });

  // /code-review on F832: a refusal that lasts is waited out a few frames, never one every frame for good.
  it("stops asking after three frames of refusals, its words left hidden (F832)", () => {
    draw();
    const words = tip();
    const toggle = vi.spyOn(words, "togglePopover").mockImplementation((force) => {
      if (force === true)
        throw new DOMException("Invalid to show a popover during another show operation", "InvalidStateError");
      return false;
    });
    keyboardFocus();
    for (let frame = 0; frame < 10; frame += 1) {
      act(() => {
        vi.advanceTimersToNextFrame();
      });
    }
    expect(toggle.mock.calls.filter(([force]) => force === true)).toHaveLength(4);
    expect(words.style.display).not.toBe("block");
    vi.restoreAllMocks();
  });

  it("waits out a later refusal as well, the frames counted again from a toggle that went (F832)", () => {
    draw();
    const words = tip();
    let refusing = true;
    vi.spyOn(words, "togglePopover").mockImplementation(function (this: HTMLElement, force) {
      if (force === true && refusing) throw new DOMException("Invalid to show", "InvalidStateError");
      this.style.display = force === true ? "block" : "";
      return force === true;
    });
    for (let round = 0; round < 3; round += 1) {
      refusing = true;
      keyboardFocus();
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      refusing = false;
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      expect(words.style.display).toBe("block");
      act(() => {
        button().blur();
      });
      expect(words.style.display).toBe("");
    }
    vi.restoreAllMocks();
  });

  it("lets any other refusal of its words rise (F832)", () => {
    draw();
    refusing(new TypeError("not a popover"));
    expect(() => {
      keyboardFocus();
    }).toThrow("not a popover");
    vi.restoreAllMocks();
  });

  // The green pass (G4): only Chrome's refusal during another popover's toggle waits; any other DOMException, or an
  // error that merely shares its name, rises.
  it.each([
    ["a DOMException of another name", new DOMException("not allowed", "NotAllowedError")],
    [
      "an error named as the refusal, not a DOMException",
      Object.assign(new Error("look-alike"), { name: "InvalidStateError" }),
    ],
  ])("lets %s rise (F832)", (_, error) => {
    draw();
    refusing(error);
    expect(() => {
      keyboardFocus();
    }).toThrow(error.message);
    vi.restoreAllMocks();
  });

  // The green pass (G3): words shown after a refusal are placed then, by their size once they have one.
  it("places its words by their size once shown, after a refused show (F832)", () => {
    Object.defineProperty(document.documentElement, "clientWidth", { value: 1000, configurable: true });
    Object.defineProperty(document.documentElement, "clientHeight", { value: 800, configurable: true });
    draw();
    const words = tip();
    const anchor = button().parentElement;
    if (anchor === null) throw new Error("no anchor");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 200, y: 300, width: 40, height: 40 }),
    );
    // A box out of the top layer has no size, as a browser draws it.
    vi.spyOn(words, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect(words.style.display === "block" ? { width: 80, height: 20 } : {}),
    );
    refusing(new DOMException("Invalid to show a popover during another show operation", "InvalidStateError"));
    keyboardFocus();
    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(words.style.display).toBe("block");
    expect([words.style.left, words.style.top]).toEqual(["180px", "280px"]);
    vi.restoreAllMocks();
  });

  // A focused control removed may fire no blur (jsdom fires none): the words go with it all the same (F353).
  it("hides the words the keyboard showed when their control leaves the page", async () => {
    const tipped = (control: boolean) => (
      <Tooltip label="Search the universe">
        {control ? <button type="button" aria-label="Search the universe" /> : null}
      </Tooltip>
    );
    const { rerender } = render(tipped(true));
    keyboardFocus();
    expect(shown()).toBe("true");
    rerender(tipped(false));
    // The observer answers in a microtask, after the change, as in a browser.
    await act(() => Promise.resolve());
    expect(shown()).toBe("false");
  });

  it("hides them on Esc, until the pointer or the focus comes again", () => {
    draw();
    keyboardFocus();
    fireEvent.keyDown(button(), { key: "Escape" });
    expect(shown()).toBe("false");
    fireEvent.pointerEnter(button());
    advance(500);
    expect(shown()).toBe("true");
  });

  it("hides them on Esc wherever the focus is, while the pointer rests on the control", () => {
    draw();
    screen.getByRole("textbox").focus();
    fireEvent.pointerEnter(button());
    advance(500);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(shown()).toBe("false");
  });

  it("never shows them when Esc comes during the half second", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(200);
    fireEvent.keyDown(document.body, { key: "Escape" });
    advance(1_000);
    expect(shown()).toBe("false");
  });

  it("shows them again on the pointer's next visit, after it went once", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(500);
    fireEvent.pointerLeave(button());
    fireEvent.pointerEnter(button());
    advance(500);
    expect(shown()).toBe("true");
  });

  it("keeps them on any key but Esc", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(500);
    fireEvent.keyDown(document.body, { key: "a" });
    expect(shown()).toBe("true");
  });

  // Two holds, each its own (WCAG 1.4.13, F334): the pointer leaving never ends the focus's, nor a blur
  // the pointer's.
  it("keeps the words the keyboard showed when the pointer comes and goes", () => {
    draw();
    keyboardFocus();
    fireEvent.pointerEnter(button());
    fireEvent.pointerLeave(button());
    expect(shown()).toBe("true");
  });

  it("keeps the words the pointer showed when the focus leaves under it", () => {
    draw();
    fireEvent.pointerEnter(button());
    advance(500);
    keyboardFocus();
    act(() => {
      screen.getByLabelText("Elsewhere").focus();
    });
    expect(shown()).toBe("true");
  });

  it("keeps the words the keyboard showed when the pointer comes too", () => {
    draw();
    keyboardFocus();
    fireEvent.pointerEnter(button());
    expect(shown()).toBe("true");
  });

  it("leaves no count and no listener behind when it leaves the page", () => {
    const listened = vi.spyOn(document, "addEventListener");
    const { unmount } = draw();
    fireEvent.pointerEnter(button());
    const signals = listened.mock.calls.flatMap(([, , options]) =>
      typeof options === "object" && options.signal !== undefined ? [options.signal] : [],
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    listened.mockRestore();
  });

  it("keeps its words from assistive technology, which has the control's name already", () => {
    draw();
    expect(tip().closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Search the universe" })).toBeTruthy();
  });

  it("shows words made of markup, or very long, as text", () => {
    staysText((text) => (
      <Tooltip label={text}>
        <button type="button" aria-label={text} />
      </Tooltip>
    ));
  });
});
