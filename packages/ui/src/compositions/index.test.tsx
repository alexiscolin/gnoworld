import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { storiesOf, type Unstyled } from "../testing.tsx";
import * as stories from "./Compositions.stories.tsx";
import {
  Center,
  Cluster,
  Grid,
  Sidebar,
  Stack,
  Switcher,
  type CenterProps,
  type ClusterProps,
  type GridProps,
  type SidebarProps,
  type StackProps,
  type SwitcherProps,
} from "./index.ts";

// None takes outside styling: tsc fails this line the day one of them does.
const noOutsideStyling: [
  Unstyled<StackProps>,
  Unstyled<ClusterProps>,
  Unstyled<GridProps>,
  Unstyled<SidebarProps>,
  Unstyled<SwitcherProps>,
  Unstyled<CenterProps>,
] = [true, true, true, true, true, true];

// Each takes a space step (Center's is its gutter), in a div unless given another element.
const ALL = [
  ["Stack", Stack],
  ["Cluster", Cluster],
  ["Grid", Grid],
  ["Sidebar", Sidebar],
  ["Switcher", Switcher],
  ["Center", Center],
] as const;

function only(container: HTMLElement) {
  const box = container.firstElementChild;
  if (!(box instanceof HTMLElement) || container.children.length !== 1) throw new Error("rendered no single box");
  return box;
}

it("no composition accepts className or style", () => {
  expect(noOutsideStyling.every(Boolean)).toBe(true);
});

describe.each(ALL)("%s", (_, Composition) => {
  it("places its children directly in a div unless given another element", () => {
    const { container, rerender } = render(
      <Composition>
        <p>Proposal 15</p>
        <p>GovDAO</p>
      </Composition>,
    );
    expect(only(container).tagName).toBe("DIV");
    expect([...only(container).children].map((c) => c.textContent)).toEqual(["Proposal 15", "GovDAO"]);
    rerender(
      <Composition as="ul">
        <li>GovDAO</li>
      </Composition>,
    );
    expect(only(container).tagName).toBe("UL");
    expect(screen.getByRole("listitem").parentElement).toBe(only(container));
  });

  it.each(["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl"] as const)("takes the space step %s", (space) => {
    const { container } = render(
      <Composition space={space}>
        <p>Earth</p>
      </Composition>,
    );
    expect(only(container).dataset["space"]).toBe(space);
  });

  it("takes the step s unless asked", () => {
    const { container } = render(
      <Composition>
        <p>Earth</p>
      </Composition>,
    );
    expect(only(container).dataset["space"]).toBe("s");
  });
});

describe("each composition's own choice", () => {
  it("Cluster lines its children up from the start, or as asked", () => {
    const { container, rerender } = render(<Cluster>a</Cluster>);
    expect(only(container).dataset["justify"]).toBe("start");
    for (const justify of ["center", "between", "end"] as const) {
      rerender(<Cluster justify={justify}>a</Cluster>);
      expect(only(container).dataset["justify"]).toBe(justify);
    }
  });

  it("Grid's columns are at least the medium column, or as asked", () => {
    const { container, rerender } = render(<Grid>a</Grid>);
    expect(only(container).dataset["min"]).toBe("m");
    for (const min of ["s", "l"] as const) {
      rerender(<Grid min={min}>a</Grid>);
      expect(only(container).dataset["min"]).toBe(min);
    }
  });

  it("Sidebar's side is its first child unless asked for the last", () => {
    const { container, rerender } = render(<Sidebar>a</Sidebar>);
    expect(only(container).dataset["side"]).toBe("start");
    rerender(<Sidebar side="end">a</Sidebar>);
    expect(only(container).dataset["side"]).toBe("end");
  });

  it("Center holds a reading measure unless asked for a dialog's width", () => {
    const { container, rerender } = render(<Center>a</Center>);
    expect(only(container).dataset["max"]).toBe("measure");
    rerender(<Center max="dialog">a</Center>);
    expect(only(container).dataset["max"]).toBe("dialog");
  });
});

it("has a story for each composition, each of which renders", () => {
  const composed = storiesOf(stories);
  for (const [name] of ALL) expect(composed.map((story) => story.name)).toContain(name);
  for (const { element } of composed) {
    const { container, unmount } = render(element);
    expect(container.textContent).toBeTruthy();
    unmount();
  }
});
