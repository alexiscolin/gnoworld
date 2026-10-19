// What the component tests share: their stories as elements, the threat model's abuse cases (slice
// 2's plan, §3), and the rule that no component takes outside styling (DESIGN-SYSTEM.md).
import { render } from "@testing-library/react";
import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { expect } from "vitest";

// True only for props that accept neither className nor style: a test assigns `true` to it, so
// tsc fails the day either prop is added.
export type Unstyled<P> = [Extract<keyof P, "className" | "style">] extends [never] ? true : false;

type Args = Record<string, unknown>;
interface Drawn {
  component?: unknown;
  args?: Args;
  render?: (args: Args) => ReactNode;
}

/** A stories file's stories as elements, args merged as Storybook merges them. Not Storybook's
 * composeStories: its runtime brings an expect of its own that stops Vitest counting assertions. */
export function storiesOf(module: Record<string, unknown>): { name: string; element: ReactElement }[] {
  const meta = (module["default"] ?? {}) as Drawn;
  return Object.entries(module)
    .filter(([name]) => name !== "default")
    .map(([name, value]) => {
      const story = value as Drawn;
      const args = { ...meta.args, ...story.args };
      const draw = story.render ?? meta.render;
      if (draw !== undefined) return { name, element: <>{draw(args)}</> };
      if (typeof meta.component !== "function")
        throw new Error(`${name}: a story with neither a component nor a render`);
      return { name, element: createElement(meta.component as ComponentType<Args>, args) };
    });
}

const ABUSE = ['<img src="x" onerror="alert(1)">', "nym-".padEnd(10_000, "a")];

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
