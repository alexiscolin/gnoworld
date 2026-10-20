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
    act(() => {
      button().focus();
    });
    expect(shown()).toBe("true");
    act(() => {
      button().blur();
    });
    expect(shown()).toBe("false");
  });

  it("hides them on Esc, until the pointer or the focus comes again", () => {
    draw();
    act(() => {
      button().focus();
    });
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

  it("stops its count when it leaves the page", () => {
    const { unmount } = draw();
    fireEvent.pointerEnter(button());
    unmount();
    advance(500);
    expect(screen.queryByText("Search the universe")).toBeNull();
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
