// What the component tests share: their stories as elements, the threat model's abuse cases (slice
// 2's plan, §3), and the rule that no component takes outside styling (DESIGN-SYSTEM.md).
import { act, render } from "@testing-library/react";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { expect } from "vitest";

/** The popovers' toggle events handled: the browser queues each as a task, as the stand-in does (testSetup.ts). */
export const toggled = () =>
  act(
    () =>
      new Promise<void>((done) => {
        setTimeout(done);
      }),
  );

// True only for props that accept neither className nor style: a test assigns `true` to it, so
// tsc fails the day either prop is added. Each member of a union is read, not their shared keys (F333).
export type Unstyled<P> = [P extends unknown ? Extract<keyof P, "className" | "style"> : never] extends [never]
  ? true
  : false;

type Args = Record<string, unknown>;
interface Drawn {
  component?: unknown;
  args?: Args;
  render?: (args: Args) => ReactNode;
}

// What Storybook draws and storiesOf does not: refused, never dropped, so no test draws a story
// unlike Storybook.
const UNDRAWN = ["decorators", "loaders", "excludeStories", "includeStories"];

function refuseUndrawn(where: string, drawn: object) {
  const found = UNDRAWN.filter((key) => key in drawn);
  if (found.length > 0) throw new Error(`${where}: ${found.join(", ")}, which storiesOf does not draw`);
}

/** A stories file's stories as elements, args merged as Storybook merges them. Not Storybook's
 * composeStories: its runtime brings an expect of its own that stops Vitest counting assertions. */
export function storiesOf(module: Record<string, unknown>): { name: string; element: ReactElement }[] {
  const meta = (module["default"] ?? {}) as Drawn;
  refuseUndrawn("the file", meta);
  return Object.entries(module)
    .filter(([name]) => name !== "default")
    .map(([name, value]) => {
      const story = value as Drawn;
      refuseUndrawn(name, story);
      const args = { ...meta.args, ...story.args };
      const draw = story.render ?? meta.render;
      if (draw !== undefined && draw.length > 1)
        throw new Error(`${name}: a render that reads its context, which storiesOf does not give`);
      if (draw !== undefined) return { name, element: <>{draw(args)}</> };
      if (typeof meta.component !== "function")
        throw new Error(`${name}: a story with neither a component nor a render`);
      return { name, element: createElement(meta.component as ComponentType<Args>, args) };
    });
}

/** Each story of a file drawn alone, read, then taken off the page: one read per story. */
export function eachStory<T>(module: Record<string, unknown>, read: (container: HTMLElement) => T): T[] {
  return storiesOf(module).map(({ element }) => {
    const { container, unmount } = render(element);
    const found = read(container);
    unmount();
    return found;
  });
}

/** The threat model's abuse cases: markup that would run if parsed, and a name of 10,000 letters. */
export const ABUSE = ['<img src="x" onerror="alert(1)">', "nym-".padEnd(10_000, "a")];

/** Text that looks like markup, or runs to 10,000 characters, reaches the page as text. */
export function staysText(draw: (text: string) => ReactElement) {
  for (const text of ABUSE) {
    const { container, unmount } = render(draw(text));
    const said = [
      container.textContent,
      ...[...container.querySelectorAll("[aria-label]")].map((e) => e.getAttribute("aria-label") ?? ""),
    ];
    expect(container.querySelector("img")).toBeNull();
    expect(said.some((t) => t.includes(text))).toBe(true);
    unmount();
  }
}
