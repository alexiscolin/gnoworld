// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Card, Room, useAlone } from "@gnoworld/ui";
import type { PerspectiveCamera } from "three";
import { afterEach, expect, it, vi } from "vitest";
import { listen, type Hand } from "./input.ts";

function Block() {
  const expand = useAlone("only");
  return (
    <Card look="hub" open={expand.open}>
      <Card.Header title="Only" expand={expand} />
    </Card>
  );
}

const handOf = (up: () => void): Hand => ({
  canvas: document.createElement("canvas"),
  labels: document.createElement("div"),
  rig: {} as Hand["rig"],
  camera: {} as PerspectiveCamera,
  screen: { width: 800, height: 600 },
  under: () => undefined,
  deeper: () => false,
  enter: () => undefined,
  up,
});

// jsdom has no popover API: the tooltip of the card's button asks for one.
Object.assign(HTMLElement.prototype, {
  showPopover: () => undefined,
  hidePopover: () => undefined,
  togglePopover: () => undefined,
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  document.body.replaceChildren();
});

const key = (target: EventTarget) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
};

it("goes up a level of space on Escape, once", () => {
  const up = vi.fn();
  const stop = new AbortController();
  listen(handOf(up), stop.signal);
  key(window);
  expect(up).toHaveBeenCalledTimes(1);
  stop.abort();
});

it("does not go up a level when the Escape closed a card open alone: the reader stays on the page", () => {
  const up = vi.fn();
  const stop = new AbortController();
  listen(handOf(up), stop.signal);
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(
      <div data-content="">
        <Room>
          <Block />
        </Room>
      </div>,
    );
  });
  const button = host.querySelector("button[aria-label='Expand Only']");
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(host.querySelector("[data-alone]")).not.toBeNull();
  key(document.body);
  expect(host.querySelector("[data-alone]")).toBeNull();
  expect(up).not.toHaveBeenCalled();
  key(document.body);
  expect(up).toHaveBeenCalledTimes(1);
  stop.abort();
  act(() => {
    root.unmount();
  });
});

it("does not go up a level when the Escape comes from a field being typed in", () => {
  const up = vi.fn();
  const stop = new AbortController();
  listen(handOf(up), stop.signal);
  const field = document.body.appendChild(document.createElement("input"));
  key(field);
  expect(up).not.toHaveBeenCalled();
  stop.abort();
});

it("does not go up a level while a dialog is open: the Escape is the dialog's", () => {
  const up = vi.fn();
  const stop = new AbortController();
  listen(handOf(up), stop.signal);
  const dialog = document.body.appendChild(document.createElement("dialog"));
  dialog.setAttribute("open", "");
  key(document.body);
  expect(up).not.toHaveBeenCalled();
  stop.abort();
});
