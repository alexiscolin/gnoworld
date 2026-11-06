// A component mounted in the DOM Vitest's jsdom gives, for the tests that click it or read it as a browser would. The
// app holds no Testing Library (a dependency to ask for), so this is React's own: createRoot inside act.
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, vi } from "vitest";

const roots: { root: Root; host: HTMLElement }[] = [];
// React flushes an update inside act only in an environment that says so; restored as the file ends.
let before: unknown;
beforeAll(() => {
  before = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no popover API, which an icon button's tooltip asks for as it mounts: the page's own journeys see it.
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
  // ... and no showModal: a dialog it opens is open, and closed by close(), as ui's tests do (packages/ui/src/testSetup.ts).
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true;
    },
    close(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  return () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", before);
  };
});
afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
    host.remove();
  }
});

/** Draws `element` in the page and returns the box that holds it; unmounted after each test. */
export function mount(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(element);
  });
  roots.push({ root, host });
  return host;
}

/** The elements of `box` that match, as an array. */
export const all = (box: ParentNode, selector: string): HTMLElement[] => [
  ...box.querySelectorAll<HTMLElement>(selector),
];

/** The one element that matches, or a failure naming the selector. */
export function one(box: ParentNode, selector: string): HTMLElement {
  const found = all(box, selector);
  const [only] = found;
  if (found.length !== 1 || only === undefined) {
    throw new Error(`${String(found.length)} elements match ${selector}, not one`);
  }
  return only;
}

/** The item at `at`, or a failure: a list read by index, which the types leave possibly empty. */
export function nth<T>(list: readonly T[], at: number): T {
  const found = list[at];
  if (found === undefined) throw new Error(`no item at ${String(at)} of ${String(list.length)}`);
  return found;
}

/** What an address draws, not the markup that holds it: the gradients' ids come from useId, so two faces of one address
 * differ in markup. The colours and the constellation are what the address says. */
export const faceOf = (face: Element): string =>
  [
    ...[...face.querySelectorAll("stop")].map((stop) => stop.getAttribute("stop-color")),
    ...[...face.querySelectorAll("polyline")].map((line) => line.getAttribute("points")),
  ].join("|");

/** Whether `b` comes after `a` in the document. */
export const follows = (a: Element, b: Element): boolean =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** A button by its visible words or its label. */
export const button = (box: ParentNode, name: string): HTMLElement | undefined =>
  all(box, "button").find((each) => (each.getAttribute("aria-label") ?? each.textContent) === name);

/** Clicks it inside act. */
export function click(element: HTMLElement | undefined): void {
  if (element === undefined) throw new Error("nothing to click");
  act(() => {
    element.click();
  });
}

/** `element` rendered to static markup and read back as DOM, for what needs no events and no effects (a component whose
 * effects jsdom cannot run, such as the composer's popover). */
export function markup(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

/** Until `holds`, the effects, promises and lazy chunks it waits on flushed inside act, or a failure after 10 s. */
export async function settled(holds: () => boolean): Promise<void> {
  const end = Date.now() + 10_000;
  while (!holds()) {
    if (Date.now() > end) throw new Error("waited 10 s");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

/** jsdom has no top layer and no showModal: a modal it opens is open, closed by close() with its event. The focus, Esc and the scrim
 * are the journeys'. */
export function modals(): void {
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function open(this: HTMLDialogElement) {
    this.open = true;
  };
  proto.close = function shut(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

/** jsdom has no popover API: a panel shown or hidden by its methods stays in the page as it is drawn. Its top layer, light dismiss and
 * placement are the journeys'. */
export function popovers(): void {
  Object.assign(HTMLElement.prototype, { showPopover: () => undefined, hidePopover: () => undefined });
}

/** jsdom has no matchMedia: every query answers no, until the test unstubs its globals. */
export function noMedia(): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })),
  );
}
