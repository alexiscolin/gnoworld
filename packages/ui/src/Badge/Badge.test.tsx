import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStoryHas, staysText } from "../testing.tsx";
import { Badge } from "./Badge.tsx";
import * as stories from "./Badge.stories.tsx";

describe("Badge", () => {
  it("is dashed until it is earned, then filled in its tone", () => {
    const { container, rerender } = render(<Badge name="Named" icon="at" tone="mine" earned={false} count="1/2" />);
    expect(container.querySelector("svg")?.hasAttribute("data-earned")).toBe(false);
    expect(container.querySelector("path[stroke-dasharray]")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Named, not earned yet");
    expect(container.textContent).toContain("1/2");
    rerender(<Badge name="Named" icon="at" tone="mine" earned />);
    expect(container.querySelector("svg")?.hasAttribute("data-earned")).toBe(true);
    expect(container.querySelector("path[stroke-dasharray]")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Named, earned");
  });

  it("has stories, each a medal", () => {
    expect(eachStoryHas(stories, "svg[role='img']")).toBe(true);
  });

  it("shows a name made of markup, or very long, as text", () => {
    staysText((text) => <Badge name={text} icon="star" tone="warm" earned />);
  });
});
