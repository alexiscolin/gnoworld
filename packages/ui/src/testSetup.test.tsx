import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { toggled } from "./testing.tsx";

// In this order on purpose: the second test sees what the first drew, unless the setup cleans up.
it("draws a paragraph on the page", () => {
  render(<p>Left behind?</p>);
  expect(document.body.textContent).toContain("Left behind?");
});

it("starts the next test on an empty page", () => {
  expect(document.body.textContent).not.toContain("Left behind?");
});

// The stand-ins for what jsdom lacks behave as the browser does, or the tests that lean on them lie.
it("opens a popover from its trigger, and closes it from there again, saying so as the browser does", async () => {
  const states: string[] = [];
  render(
    <>
      <button type="button" popoverTarget="p">
        Open
      </button>
      <div id="p" popover="auto" onToggle={(event) => states.push(event.newState)}>
        <button type="button">Inside</button>
      </div>
    </>,
  );
  expect(screen.queryByRole("button", { name: "Inside" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.getByRole("button", { name: "Inside" })).toBeTruthy();
  expect(states).toEqual([]);
  await toggled();
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(screen.queryByRole("button", { name: "Inside" })).toBeNull();
  await toggled();
  expect(states).toEqual(["open", "closed"]);
});

// A popover that writes each toggle's new state to `states`.
function toggling(states: string[]) {
  render(
    <div data-testid="p" popover="auto" onToggle={(event) => states.push(event.newState)}>
      <p>Inside</p>
    </div>,
  );
  return screen.getByTestId("p");
}

it("says nothing of a popover asked to be what it is already, as the browser does", async () => {
  const states: string[] = [];
  const panel = toggling(states);
  act(() => {
    panel.showPopover();
    panel.showPopover();
    panel.togglePopover(true);
  });
  await toggled();
  act(() => {
    panel.hidePopover();
    panel.hidePopover();
  });
  await toggled();
  expect(states).toEqual(["open", "closed"]);
});

// Chromium 156 fires toggle as a later task, once for changes made in a row (F924): code that reads
// the focus or the state there runs after the page's own handlers, not inside them.
it("tells of a popover's toggle after the change, once for changes in a row", async () => {
  const states: string[] = [];
  const panel = toggling(states);
  act(() => {
    panel.showPopover();
  });
  expect(states).toEqual([]);
  act(() => {
    panel.hidePopover();
  });
  await toggled();
  expect(states).toEqual(["closed"]);
});

it("closes an open dialog once, saying so with its close event, and a closed one not again", () => {
  let closes = 0;
  render(
    <dialog
      onClose={() => {
        closes += 1;
      }}
    >
      <p>Passport</p>
    </dialog>,
  );
  const dialog = screen.getByRole<HTMLDialogElement>("dialog", { hidden: true });
  act(() => {
    dialog.showModal();
  });
  expect(dialog.open).toBe(true);
  act(() => {
    dialog.close();
    dialog.close();
  });
  expect([dialog.open, closes]).toEqual([false, 1]);
});

it("answers no to every media query, so nothing that waits for no preference moves", () => {
  expect(matchMedia("(prefers-reduced-motion: no-preference)").matches).toBe(false);
});
