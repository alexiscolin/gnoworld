import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Kicker } from "./Kicker.tsx";
import * as stories from "./Kicker.stories.tsx";

describe("Kicker", () => {
  it("keeps its text as written in a paragraph: the capitals are the style's, not the words'", () => {
    render(<Kicker>On chain · 96 calls a day</Kicker>);
    expect(screen.getByText("On chain · 96 calls a day").tagName).toBe("P");
  });

  it("draws no dot unless asked", () => {
    const { container } = render(<Kicker>Today</Kicker>);
    expect(container.querySelector("[data-tone]")).toBeNull();
  });

  it.each(["warm", "mine", "signal"] as const)("draws a %s dot before the text, hidden from its reading", (tone) => {
    const { container } = render(<Kicker dot={tone}>Live</Kicker>);
    const dot = container.querySelector("[data-tone]");
    expect(dot?.getAttribute("data-tone")).toBe(tone);
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.nextSibling?.textContent).toBe("Live");
    expect(container.textContent).toBe("Live");
  });

  it("runs vertically for the plate's atlas caption, and says so", () => {
    const { rerender } = render(<Kicker>Hub atlas</Kicker>);
    expect(screen.getByText("Hub atlas").dataset["orientation"]).not.toBe("vertical");
    rerender(<Kicker vertical>Hub atlas</Kicker>);
    expect(screen.getByText("Hub atlas").dataset["orientation"]).toBe("vertical");
  });

  it("shows text made of markup, or very long, as text", () => {
    staysText((text) => <Kicker>{text}</Kicker>);
  });

  it("has stories for each dot and for the vertical caption", () => {
    const shown = eachStory(stories, (container) =>
      [...container.querySelectorAll("p")].map((p) => ({
        text: p.textContent,
        dot: p.querySelector("[data-tone]")?.getAttribute("data-tone"),
        vertical: p.dataset["orientation"] === "vertical",
      })),
    ).flat();
    expect(shown.every((k) => k.text !== "")).toBe(true);
    for (const tone of ["warm", "mine", "signal"]) expect(shown.some((k) => k.dot === tone)).toBe(true);
    expect(shown.some((k) => k.vertical)).toBe(true);
  });
});
