import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo.tsx";

// Slice 5r: the header's mark and the wordmark "gnoworld" (docs/DESIGN-SYSTEM.md, the component table).
describe("Logo", () => {
  it("draws the mark alone as a picture no reader says, with no text of its own", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("");
  });

  it("with its wordmark, says gnoworld once, as text, so a link around it is named by it", () => {
    render(
      <a href="/">
        <Logo wordmark />
      </a>,
    );
    expect(screen.getByRole("link", { name: "gnoworld" })).toBeTruthy();
  });

  it("draws the mark's ring in the text's colour", () => {
    const { container } = render(<Logo wordmark />);
    expect(container.querySelector("circle[stroke='currentColor']")).not.toBeNull();
  });

  it("is no link and no button itself: the page decides what it opens", () => {
    const { container } = render(<Logo wordmark />);
    expect(container.querySelector("a, button")).toBeNull();
  });

  // F3264: the mark of the video's frames 6 and 20 and the prototype's #hnav .brand: a dotted ring, an inner ring, a dot at the
  // heart and two moons; and the word is "gno" in 600 and "world" in 300.
  it("draws the video's mark: a dotted ring, an inner ring, a dot and two moons", () => {
    const { container } = render(<Logo />);
    const circles = [...container.querySelectorAll("circle")].map((circle) => ({
      cx: circle.getAttribute("cx"),
      cy: circle.getAttribute("cy"),
      r: circle.getAttribute("r"),
      fill: circle.getAttribute("fill"),
      dash: circle.getAttribute("stroke-dasharray"),
    }));
    expect(circles).toEqual([
      { cx: "16", cy: "16", r: "13.5", fill: "none", dash: "0.1 3.4" },
      { cx: "16", cy: "16", r: "8", fill: "none", dash: null },
      { cx: "16", cy: "16", r: "3.4", fill: "currentColor", dash: null },
      { cx: "24", cy: "16", r: "1.9", fill: "currentColor", dash: null },
      { cx: "6.9", cy: "25.4", r: "1.6", fill: "currentColor", dash: null },
    ]);
  });

  it("sets the word's first three letters apart, as one word still: gnoworld", () => {
    const { container } = render(<Logo wordmark />);
    expect(container.querySelector("b")?.textContent).toBe("gno");
    expect(container.textContent).toBe("gnoworld");
  });

  // Alexis, 2026-11-07: the loader's mark, its moons turning and a mint arc filling the ring with what is ready.
  it("while loading, turns its two moons and fills a mint arc of what is ready over the dotted ring", () => {
    const { container } = render(<Logo progress={0.25} />);
    expect(container.querySelectorAll("g[class]")).toHaveLength(2);
    const arc = container.querySelector("circle[stroke='var(--color-mine)']");
    expect(Number(arc?.getAttribute("stroke-dashoffset"))).toBeCloseTo(85 * 0.75, 6);
    expect(
      Number(
        render(<Logo progress={7} />)
          .container.querySelector("circle[stroke-dashoffset]")
          ?.getAttribute("stroke-dashoffset"),
      ),
    ).toBe(0);
  });

  it("draws the plain mark, no arc and no turning moon, with no progress", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("circle[stroke='var(--color-mine)']")).toBeNull();
    expect(container.querySelectorAll("g[class]")).toHaveLength(0);
  });
});
