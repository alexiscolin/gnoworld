// A component mounted in the DOM Vitest's jsdom gives, for the tests that click it or read it as a browser would. The
// app holds no Testing Library (a dependency to ask for), so this is React's own: createRoot inside act.
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, expect } from "vitest";

const roots: { root: Root; host: HTMLElement }[] = [];
// React flushes an update inside act only in an environment that says so; restored as the file ends.
let before: unknown;
beforeAll(() => {
  before = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no popover API, which an icon button's tooltip asks for as it mounts: the page's own journeys see it.
  Object.assign(HTMLElement.prototype, { togglePopover: () => true });
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

/** The threat model's abuse cases, as ui's staysText has them: markup that would run if parsed, and a name of 10,000 letters. */
const ABUSE = ['<img src="x" onerror="alert(1)">', "nym-".padEnd(10_000, "a")];

/** Text that looks like markup, or runs to 10,000 characters, reaches the page as text: no image comes of it, and the words
 * are read whole in the text or in a label. */
export function staysText(draw: (text: string) => ReactElement): void {
  for (const text of ABUSE) {
    const box = mount(draw(text));
    const said = [box.textContent, ...all(box, "[aria-label]").map((each) => each.getAttribute("aria-label") ?? "")];
    expect(all(box, "img")).toHaveLength(0);
    expect(said.some((each) => each.includes(text))).toBe(true);
  }
}
