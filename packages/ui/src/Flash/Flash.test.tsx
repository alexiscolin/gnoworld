import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Flash, type FlashMessage } from "./Flash.tsx";
import * as stories from "./Flash.stories.tsx";

const saved = { title: "Saved to your rooms", line: "Bubble · the AMA on sessions" };
const deleted = (onAction: () => void) => ({ title: "Message deleted", action: { label: "Undo", onAction } });

// Time goes on by so many milliseconds, and React draws what it changed.
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// The count ends 5 s from now, to the millisecond: nothing at 4,999 ms, one close at 5,000.
function endsIn5s(onClose: ReturnType<typeof vi.fn>) {
  advance(4_999);
  expect(onClose).not.toHaveBeenCalled();
  advance(1);
  expect(onClose).toHaveBeenCalledOnce();
}

// A timed flash with a button beside it, where the focus can go; its onClose, to watch.
function withElsewhere() {
  const onClose = vi.fn();
  render(
    <>
      <Flash message={saved} onClose={onClose} />
      <button type="button">Elsewhere</button>
    </>,
  );
  return onClose;
}

// A flash as a page holds it: its message is state, its close clears it, and its action may set the next.
function Held({ start, next = null }: { start: FlashMessage; next?: FlashMessage | null }) {
  const [message, setMessage] = useState<FlashMessage | null>({
    ...start,
    ...(start.action === undefined
      ? {}
      : {
          action: {
            ...start.action,
            onAction: () => {
              setMessage(next);
            },
          },
        }),
  });
  return (
    <Flash
      message={message}
      onClose={() => {
        setMessage(null);
      }}
    />
  );
}

describe("Flash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a status region on the page from the start, empty while it has nothing to say: no text, no button", () => {
    const { container } = render(<Flash message={null} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("says its title and line in the region that was already there, so the change is announced", () => {
    const { rerender } = render(<Flash message={null} onClose={vi.fn()} />);
    const region = screen.getByRole("status");
    rerender(<Flash message={saved} onClose={vi.fn()} />);
    expect(screen.getByRole("status")).toBe(region);
    expect(within(region).getByText(saved.title)).toBeTruthy();
    expect(within(region).getByText(saved.line)).toBeTruthy();
  });

  it("ends a flash with no action after 5 s, not before; its one button is Close", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Close"]);
    endsIn5s(onClose);
  });

  // WCAG 2.2.1: the keyboard and touch can end or keep what the pointer can (Alexis, F260).
  it("ends a flash with no action at once from its Close", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith();
  });

  it("holds a flash with no action while the focus is in it, then gives it 5 s again", () => {
    const onClose = withElsewhere();
    advance(3_000);
    act(() => {
      screen.getByRole("button", { name: "Close" }).focus();
    });
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      screen.getByRole("button", { name: "Elsewhere" }).focus();
    });
    endsIn5s(onClose);
  });

  // Two holds, each its own: the pointer leaving never ends the focus's, nor the focus leaving the pointer's.
  it.each([
    ["the pointer leaves while the focus stays", "pointer"],
    ["the focus leaves while the pointer stays", "focus"],
  ] as const)("stays held when %s, and counts 5 s once both are gone", (_, first) => {
    const onClose = withElsewhere();
    const flash = screen.getByText(saved.title);
    const close = screen.getByRole("button", { name: "Close" });
    const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
    const leave = {
      pointer: () => fireEvent.pointerLeave(flash),
      focus: () => {
        act(() => {
          elsewhere.focus();
        });
      },
    };
    fireEvent.pointerEnter(flash);
    act(() => {
      close.focus();
    });
    leave[first]();
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
    leave[first === "pointer" ? "focus" : "pointer"]();
    endsIn5s(onClose);
  });

  // Held, not paused: once the pointer leaves, a full 5 s again (docs/DESIGN-SYSTEM.md, "Motion").
  it("holds a flash with no action while the pointer is over it, then gives it 5 s again", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    const flash = screen.getByText(saved.title);
    advance(3_000);
    fireEvent.pointerEnter(flash);
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerLeave(flash);
    endsIn5s(onClose);
  });

  it("gives a new message its own 5 s", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={saved} onClose={onClose} />);
    advance(3_000);
    rerender(<Flash message={{ title: "Left the room" }} onClose={onClose} />);
    endsIn5s(onClose);
  });

  it("keeps its count when its page hands it the same words in a new object", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={{ ...saved }} onClose={onClose} />);
    advance(3_000);
    rerender(<Flash message={{ ...saved }} onClose={onClose} />);
    advance(2_000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays held when new words replace it under a resting pointer", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={saved} onClose={onClose} />);
    fireEvent.pointerEnter(screen.getByText(saved.title));
    rerender(<Flash message={{ title: "Left the room" }} onClose={onClose} />);
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });

  // Closed or taken under the pointer, a flash leaves without a pointerleave: the next is not held.
  it("leaves the next flash its 5 s when one is closed under the pointer", () => {
    const { rerender } = render(<Flash message={deleted(vi.fn())} onClose={vi.fn()} />);
    fireEvent.pointerEnter(screen.getByText("Message deleted"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    rerender(<Flash message={null} onClose={vi.fn()} />);
    const onClose = vi.fn();
    rerender(<Flash message={saved} onClose={onClose} />);
    endsIn5s(onClose);
  });

  it("keeps counting when its page hands it a new onClose, and calls the latest one", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<Flash message={saved} onClose={first} />);
    advance(3_000);
    rerender(<Flash message={saved} onClose={latest} />);
    advance(2_000);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("stops its count once it leaves the page", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Flash message={saved} onClose={onClose} />);
    unmount();
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a flash with an action until it is taken or closed", () => {
    const onClose = vi.fn();
    render(<Flash message={deleted(vi.fn())} onClose={onClose} />);
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });

  // It closes before it acts: the act may raise the next flash, which a close after it would wipe.
  it("ends when its action is taken, then does it, so the act may raise the next flash", () => {
    render(<Held start={deleted(() => undefined)} next={{ title: "Restored" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const region = screen.getByRole("status");
    expect(within(region).getByText("Restored")).toBeTruthy();
    expect(within(region).queryByText("Message deleted")).toBeNull();
  });

  // The action's button leaves with the flash it ends, and a removed element may fire no blur (jsdom
  // fires none; Chromium 156 does): where the focus is decides the hold, whatever moved it (F308, F316).
  // Each case: the focus's way back before the page changes it, and after.
  it.each([
    ["the focus came to it from nowhere", () => null],
    [
      "the focus's way back has left the page",
      (after: boolean) => (after ? null : <button type="button">Before</button>),
    ],
    [
      "the focus's way back can no longer take it",
      (after: boolean) => (
        <button type="button" disabled={after}>
          Before
        </button>
      ),
    ],
  ])("counts 5 s for the timed flash an action raises, though %s", (_, before) => {
    const page = (after: boolean) => (
      <>
        {before(after)}
        <Held start={deleted(() => undefined)} next={{ title: "Restored" }} />
      </>
    );
    const { rerender } = render(page(false));
    act(() => {
      screen.queryByRole("button", { name: "Before" })?.focus();
      screen.getByRole("button", { name: "Undo" }).focus();
    });
    rerender(page(true));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("status").textContent).toContain("Restored");
    advance(5_000);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("counts 5 s for a timed flash its page puts in place of one whose action held the focus", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={deleted(vi.fn())} onClose={onClose} />);
    act(() => {
      screen.getByRole("button", { name: "Undo" }).focus();
    });
    rerender(<Flash message={{ title: "Connection lost" }} onClose={onClose} />);
    endsIn5s(onClose);
  });

  it("hands its handlers nothing of the click", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={deleted(onAction)} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onClose).toHaveBeenCalledWith();
    expect(onAction).toHaveBeenCalledWith();
    rerender(<Flash message={deleted(onAction)} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenLastCalledWith();
  });

  it.each([
    ["Undo", "Message deleted", deleted(() => undefined)],
    ["Close", "Message deleted", deleted(() => undefined)],
    ["Close", saved.title, saved],
  ])("gives the focus back to where it was when %s takes %s away", (name, title, start) => {
    render(
      <>
        <button type="button">Before</button>
        <Held start={start} />
      </>,
    );
    act(() => {
      screen.getByRole("button", { name: "Before" }).focus();
      screen.getByRole("button", { name }).focus();
    });
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.queryByText(title)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }));
  });

  // Its way back is for the focus it took (F307): from nowhere, from inside itself, or gone elsewhere since.
  it("closes from its Close when the focus came to it from nowhere", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    act(() => {
      screen.getByRole("button", { name: "Close" }).focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives the focus back to where it came from outside, not to its own Undo", () => {
    render(
      <>
        <button type="button">Before</button>
        <Held start={deleted(() => undefined)} />
      </>,
    );
    act(() => {
      for (const name of ["Before", "Undo", "Close"]) screen.getByRole("button", { name }).focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Before" }));
  });

  it("leaves the focus where it went since, when its Close is clicked without taking it", () => {
    render(
      <>
        <button type="button">Before</button>
        <Held start={saved} />
        <input aria-label="Typing" />
      </>,
    );
    act(() => {
      screen.getByRole("button", { name: "Before" }).focus();
      screen.getByRole("button", { name: "Close" }).focus();
      screen.getByRole("textbox", { name: "Typing" }).focus();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Typing" }));
  });

  it("draws no line for a flash that has none", () => {
    render(<Flash message={{ title: "Left the room" }} onClose={vi.fn()} />);
    expect(screen.getByRole("status").querySelectorAll("p")).toHaveLength(1);
  });

  it("ends when closed, without its action", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<Flash message={deleted(onAction)} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("draws its action as the outline button: a flash carries no cream primary", () => {
    render(<Flash message={deleted(vi.fn())} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Undo" }).dataset["emphasis"]).toBe("outline");
  });

  it("shows a title, a line and an action's label made of markup, or very long, as text", () => {
    staysText((text) => <Flash message={{ title: text, line: text }} onClose={vi.fn()} />);
    staysText((text) => (
      <Flash message={{ title: "Saved", action: { label: text, onAction: vi.fn() } }} onClose={vi.fn()} />
    ));
  });

  it("has stories with an action, without one, and empty", () => {
    const shown = eachStory(stories, (container) => ({
      said: container.querySelector("[role='status']")?.textContent ?? "",
      buttons: container.querySelectorAll("button").length,
    }));
    expect(shown.some((s) => s.said !== "" && s.buttons === 1)).toBe(true);
    expect(shown.some((s) => s.said !== "" && s.buttons === 2)).toBe(true);
    expect(shown.some((s) => s.said === "" && s.buttons === 0)).toBe(true);
  });
});
