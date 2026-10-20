import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABUSE, eachStory } from "../testing.tsx";
import { PlanetThumb } from "./PlanetThumb.tsx";
import * as stories from "./PlanetThumb.stories.tsx";

describe("PlanetThumb", () => {
  it("is a picture named by its place, of its kind, a world and medium unless asked", () => {
    render(<PlanetThumb src="/thumbs/bubble.png" name="Bubble" />);
    const picture = screen.getByRole("img", { name: "Bubble" });
    expect(picture.getAttribute("src")).toBe("/thumbs/bubble.png");
    const disc = picture.closest<HTMLElement>("[data-kind]");
    expect([disc?.dataset["kind"], disc?.dataset["size"]]).toEqual(["world", "m"]);
  });

  it("is decoration beside its name when the row says it already", () => {
    const { container } = render(<PlanetThumb src="/thumbs/bubble.png" name="Bubble" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("magnifies under the pointer only when asked, as the dock does", () => {
    const { container, rerender } = render(<PlanetThumb src="/a.png" name="A" />);
    expect((container.firstElementChild as HTMLElement).dataset["magnify"]).toBeUndefined();
    rerender(<PlanetThumb src="/a.png" name="A" magnify />);
    expect((container.firstElementChild as HTMLElement).dataset["magnify"]).toBe("");
  });

  it("keeps a name made of markup, or very long, as its picture's words: one picture, nothing more", () => {
    for (const text of ABUSE) {
      const { container, unmount } = render(<PlanetThumb src="/a.png" name={text} />);
      const pictures = container.querySelectorAll("img");
      expect(pictures).toHaveLength(1);
      expect(pictures[0]?.getAttribute("alt")).toBe(text);
      expect(pictures[0]?.getAttribute("src")).toBe("/a.png");
      unmount();
    }
  });

  it("has stories for each kind, at each size", () => {
    const thumbs = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-kind]")].map((p) => p.dataset),
    ).flat();
    for (const kind of ["world", "cluster", "star", "station", "signal"])
      expect(thumbs.map((t) => t["kind"])).toContain(kind);
    for (const size of ["s", "m", "l"]) expect(thumbs.map((t) => t["size"])).toContain(size);
  });
});
