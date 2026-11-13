import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory, storiesOf } from "../testing.tsx";
import * as stories from "./Compositions.stories.tsx";
import { Center, Cluster, Grid, Sidebar, Stack, Switcher } from "./index.ts";

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

  it("takes a block's own class, an id and ARIA beside its own class and step", () => {
    const { container } = render(
      <Composition as="ul" className="lines" id="room-lines" aria-label="Messages">
        <li>gm</li>
      </Composition>,
    );
    const box = only(container);
    expect(box.classList).toContain("lines");
    expect(box.classList.length).toBeGreaterThan(1);
    expect(box.id).toBe("room-lines");
    expect(screen.getByRole("list", { name: "Messages" })).toBe(box);
    expect(box.dataset["space"]).toBe("s");
  });

  it("may be a list's item", () => {
    const { container } = render(
      <ul>
        <Composition as="li">
          <span>GovDAO</span>
        </Composition>
      </ul>,
    );
    expect(screen.getByRole("listitem").parentElement).toBe(only(container));
  });

  // The type is the composition's own, which the lint cannot see through `as`.
  it.each(["button"] as const)("may be a %s that submits nothing", (element) => {
    const { container } = render(
      <Composition as={element} aria-expanded={false}>
        <span>Proposal 15</span>
      </Composition>,
    );
    const button = screen.getByRole("button", { name: "Proposal 15", expanded: false });
    expect(button).toBe(only(container));
    expect(button.getAttribute("type")).toBe("button");
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
    rerender(<Grid min="s">a</Grid>);
    expect(only(container).dataset["min"]).toBe("s");
  });

  // The blocks' own rows (Disclosure's) draw these two with the utility classes: one definition for both.
  it("Grid draws the text-meta and icon-text-meta templates with the utility classes of the same names", () => {
    const { container, rerender } = render(<Grid template="text-meta">a</Grid>);
    expect(only(container).classList).toContain("text-meta");
    rerender(<Grid template="icon-text-meta">a</Grid>);
    expect(only(container).classList).toContain("icon-text-meta");
    expect(only(container).classList).not.toContain("text-meta");
  });

  it("Sidebar's side is its first child unless asked for the last", () => {
    const { container, rerender } = render(<Sidebar>a</Sidebar>);
    expect(only(container).dataset["side"]).toBe("start");
    rerender(<Sidebar side="end">a</Sidebar>);
    expect(only(container).dataset["side"]).toBe("end");
  });

  it("Center holds a reading measure unless asked for the whole page", () => {
    const { container, rerender } = render(<Center>a</Center>);
    expect(only(container).dataset["max"]).toBe("measure");
    rerender(<Center max="page">a</Center>);
    expect(only(container).dataset["max"]).toBe("page");
  });
});

it("has a story for each composition, each of which renders", () => {
  const composed = storiesOf(stories);
  for (const [name] of ALL) expect(composed.map((story) => story.name)).toContain(name);
  for (const text of eachStory(stories, (container) => container.textContent)) expect(text).toBeTruthy();
});
