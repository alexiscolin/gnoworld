// A composer drawn in the page for the tests that press its keys and read what its field holds: the field is Lexical's, which fills
// its box in the browser, so the draft is read from the editor as the Markdown the room reads.
import { getNearestEditorFromDOMNode } from "lexical";
import { act, type ReactElement } from "react";
import { afterEach, vi } from "vitest";
import { getMarkdown } from "../src/features/chat/composer/markdownEditor.ts";
import { mount } from "./mount.tsx";

export const FIELD = '[role="textbox"]';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** jsdom has no geometry of a range, which the editor asks to scroll the caret into view: none, as a page nobody sees. */
export function rangesHaveNoGeometry() {
  const none = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
  Object.assign(Range.prototype, { getBoundingClientRect: () => none, getClientRects: () => [] });
}

/** Work done in the page, and the editor's settling of it: the editor applies an update in a microtask, which act waits for. */
export async function acting(work: () => void) {
  await act(async () => {
    work();
    await Promise.resolve();
  });
}

/** `ui` in the page, its field, and the Markdown the field holds. */
export function inPage(ui: ReactElement, { coarse = false }: { coarse?: boolean } = {}) {
  // jsdom has no matchMedia: a computer's pointer unless `coarse`. Nor the popover API, which the bar's link tool uses.
  Object.assign(HTMLElement.prototype, { togglePopover: vi.fn(), showPopover: vi.fn(), hidePopover: vi.fn() });
  vi.stubGlobal("matchMedia", () => ({ matches: coarse, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  rangesHaveNoGeometry();
  const host = mount(ui);
  const box = host.querySelector<HTMLElement>(FIELD);
  if (box === null) throw new Error("the composer drew no field");
  const editor = getNearestEditorFromDOMNode(box);
  if (editor === null) throw new Error("the field has no editor");
  return {
    host,
    box,
    editor,
    held: () => getMarkdown(editor),
    /** A key pressed in the field, as the browser sends it, its effects settled; whether it was left alone (not prevented). */
    press: async (key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      await acting(() => {
        box.dispatchEvent(event);
      });
      return !event.defaultPrevented;
    },
  };
}
