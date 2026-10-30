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
});
