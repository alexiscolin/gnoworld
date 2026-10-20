import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory } from "../testing.tsx";
import { Skeleton } from "./Skeleton.tsx";
import * as stories from "./Skeleton.stories.tsx";

describe("Skeleton", () => {
  it("is a shape hidden from assistive technology, a line unless asked", () => {
    const { container } = render(<Skeleton />);
    const shape = container.firstElementChild as HTMLElement;
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    expect(shape.dataset["shape"]).toBe("line");
    expect(shape.textContent).toBe("");
  });

  it("draws a card's shape, and as many lines as asked", () => {
    const { container, rerender } = render(<Skeleton shape="card" />);
    expect((container.firstElementChild as HTMLElement).dataset["shape"]).toBe("card");
    rerender(<Skeleton lines={3} />);
    expect(container.querySelectorAll("[data-shape='line']")).toHaveLength(3);
  });

  it("has stories for lines and a card", () => {
    const shapes = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-shape]")].map((s) => s.dataset["shape"]),
    ).flat();
    expect(shapes).toContain("line");
    expect(shapes).toContain("card");
  });
});
