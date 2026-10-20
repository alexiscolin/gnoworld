import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Row } from "./Row.tsx";
import * as stories from "./Row.stories.tsx";

describe("Row", () => {
  it("shows its title, subtitle and activity in order, its lead and trail around them", () => {
    render(
      <Row
        lead={<span>lead</span>}
        title="Bubble"
        subtitle="The BUBBLE token"
        activity="214 here now"
        trail={<span>trail</span>}
      />,
    );
    const row = screen.getByText("Bubble").closest("[data-look]");
    expect(row?.textContent).toBe("leadBubbleThe BUBBLE token214 here nowtrail");
  });

  it("is plain and not current unless asked, and says when it is current", () => {
    const { rerender } = render(<Row title="Bubble" />);
    const row = () => screen.getByText("Bubble").closest<HTMLElement>("[data-look]");
    expect(row()?.dataset["look"]).toBe("plain");
    expect(row()?.hasAttribute("aria-current")).toBe(false);
    rerender(<Row title="Bubble" look="boxed" current />);
    expect(row()?.dataset["look"]).toBe("boxed");
    expect(row()?.getAttribute("aria-current")).toBe("true");
  });

  it("with an href, is one link named by its title, the rest of its words inside", () => {
    render(<Row title="Bubble" subtitle="The BUBBLE token" href="/w/bubble" />);
    const link = screen.getByRole("link", { name: /Bubble/ });
    expect(link.getAttribute("href")).toBe("/w/bubble");
  });

  // As a page's data would hand them over, in the spellings a browser still runs.
  it.each(["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)"])(
    "never links to a script, whatever href it is given: %j",
    (script) => {
      render(<Row title="Bubble" href={script} />);
      expect(screen.getByRole("link", { name: /Bubble/ }).getAttribute("href")).not.toContain("alert(1)");
    },
  );

  it("shows words made of markup, or very long, as text", () => {
    staysText((text) => <Row title={text} subtitle={text} activity={text} />);
  });

  it("has stories plain, divided, boxed and current, with a picture lead", () => {
    const looks = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-look]")].map((r) => ({
        look: r.dataset["look"],
        current: r.getAttribute("aria-current") === "true",
        picture: r.querySelector("img") !== null,
      })),
    ).flat();
    for (const look of ["plain", "divided", "boxed"]) expect(looks.some((r) => r.look === look)).toBe(true);
    expect(looks.some((r) => r.current) && looks.some((r) => r.picture)).toBe(true);
  });
});
