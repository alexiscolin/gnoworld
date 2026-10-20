import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Flash } from "./Flash.tsx";
import * as stories from "./Flash.stories.tsx";

const saved = { title: "Saved to your rooms", line: "Bubble · the AMA on sessions" };
const deleted = (onAction: () => void) => ({ title: "Message deleted", action: { label: "Undo", onAction } });

// The count ends 5 s from now, to the millisecond: nothing at 4,999 ms, one close at 5,000.
function endsIn5s(onClose: ReturnType<typeof vi.fn>) {
  act(() => {
    vi.advanceTimersByTime(4_999);
  });
  expect(onClose).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(onClose).toHaveBeenCalledOnce();
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

  it("ends a flash with no action after 5 s, not before, and has no button", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    endsIn5s(onClose);
  });

  // Held, not paused: once the pointer leaves, a full 5 s again (docs/DESIGN-SYSTEM.md, "Motion").
  it("holds a flash with no action while the pointer is over it, then gives it 5 s again", () => {
    const onClose = vi.fn();
    render(<Flash message={saved} onClose={onClose} />);
    const flash = screen.getByText(saved.title);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.pointerEnter(flash);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerLeave(flash);
    endsIn5s(onClose);
  });

  it("gives a new message its own 5 s", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={saved} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    rerender(<Flash message={{ title: "Left the room" }} onClose={onClose} />);
    endsIn5s(onClose);
  });

  it("keeps its count when its page hands it the same words in a new object", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={{ ...saved }} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    rerender(<Flash message={{ ...saved }} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays held when new words replace it under a resting pointer", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Flash message={saved} onClose={onClose} />);
    fireEvent.pointerEnter(screen.getByText(saved.title));
    rerender(<Flash message={{ title: "Left the room" }} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
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
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    rerender(<Flash message={saved} onClose={latest} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });

  it("stops its count once it leaves the page", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Flash message={saved} onClose={onClose} />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a flash with an action until it is taken or closed", () => {
    const onClose = vi.fn();
    render(<Flash message={deleted(vi.fn())} onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ends when its action is taken, after doing it", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<Flash message={deleted(onAction)} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAction.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0] ?? 0);
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
    expect(shown.some((s) => s.said !== "" && s.buttons === 0)).toBe(true);
    expect(shown.some((s) => s.said !== "" && s.buttons === 2)).toBe(true);
    expect(shown.some((s) => s.said === "" && s.buttons === 0)).toBe(true);
  });
});
