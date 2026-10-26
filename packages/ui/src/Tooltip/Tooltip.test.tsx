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

  it("lets any other refusal of its words rise (F832)", () => {
    draw();
    refusing(new TypeError("not a popover"));
    expect(() => {
      keyboardFocus();
    }).toThrow("not a popover");
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
