import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Chip } from "./Chip.tsx";
import * as stories from "./Chip.stories.tsx";

describe("Chip", () => {
  it("with a handler, is a button named by its words, its count among them", () => {
    render(
      <Chip count={3} onClick={vi.fn()}>
        Dev help
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Dev help 3" });
    expect(chip.getAttribute("type")).toBe("button");
  });

  it("says whether it is selected only when it toggles, and calls its handler", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Chip onClick={onClick}>Games</Chip>);
    expect(screen.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
    rerender(
      <Chip selected onClick={onClick}>
        Games
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Games", pressed: true }));
    expect(onClick).toHaveBeenCalledExactlyOnceWith();
    rerender(
      <Chip selected={false} onClick={onClick}>
        Games
      </Chip>,
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("without a handler, is a static mark in its tone, no control", () => {
    render(<Chip tone="warm">Live</Chip>);
    expect(screen.queryByRole("button")).toBeNull();
    const mark = screen.getByText("Live");
    expect(mark.dataset["tone"]).toBe("warm");
    expect(mark.dataset["size"]).toBe("xs");
  });

  it("is neutral unless asked, and a control at the small size", () => {
    render(<Chip onClick={vi.fn()}>Games</Chip>);
    const chip = screen.getByRole("button");
    expect([chip.dataset["tone"], chip.dataset["size"]]).toEqual(["neutral", "s"]);
  });

  it("shows words made of markup, or very long, as text", () => {
    staysText((text) => <Chip>{text}</Chip>);
    staysText((text) => <Chip onClick={vi.fn()}>{text}</Chip>);
  });

  it("has stories for a control, selected, with a count, and a static mark in each tone", () => {
    const shown = eachStory(stories, (container) =>
      [...container.querySelectorAll<HTMLElement>("[data-tone]")].map((c) => ({
        control: c.tagName === "BUTTON",
        pressed: c.getAttribute("aria-pressed"),
        tone: c.dataset["tone"],
        counted: /\d/.test(c.textContent),
      })),
    ).flat();
    expect(shown.some((c) => c.control && c.pressed === "true")).toBe(true);
    expect(shown.some((c) => c.control && c.counted)).toBe(true);
    for (const tone of ["neutral", "mine", "warm", "signal", "danger"])
      expect(shown.some((c) => !c.control && c.tone === tone)).toBe(true);
  });
});

// 4d: a reaction's chip says more than its words to a screen reader (its emoji, its count, "including you":
// docs/DESIGN-SYSTEM.md), a label of its own; a static mark is read by its words alone.
describe("Chip: its label", () => {
  it("names a control by its label, its words and its count still shown", () => {
    render(
      <Chip label="👍, 2, including you" count={2} selected onClick={vi.fn()}>
        👍
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "👍, 2, including you", pressed: true });
    expect(chip.textContent).toBe("👍 2");
  });

  it("names a control by its words when it has no label", () => {
    render(<Chip onClick={vi.fn()}>Games</Chip>);
    expect(screen.getByRole("button").hasAttribute("aria-label")).toBe(false);
  });

  it("gives a static mark no label: its words name it", () => {
    render(<Chip tone="mine">Your vote</Chip>);
    expect(screen.getByText("Your vote").hasAttribute("aria-label")).toBe(false);
  });

  it("has a story for a reaction, labelled", () => {
    const labels = eachStory(stories, (container) =>
      [...container.querySelectorAll("button[aria-label]")].map((chip) => chip.getAttribute("aria-label")),
    ).flat();
    expect(labels).toContain("👍, 2, including you");
  });
});

// A live pulse beats for a minute and rests; a new content beats it again, which a new element does (the animation starts with its element).
describe("the dot's pulse", () => {
  it("beats the chip's dot again for a new word, and leaves it for the same one", () => {
    const view = render(<Chip dot>Live · last call 3 hours ago</Chip>);
    const dot = view.container.querySelector("i");
    view.rerender(<Chip dot>Live · last call 3 hours ago</Chip>);
    expect(view.container.querySelector("i")).toBe(dot);
    view.rerender(<Chip dot>Live · last call 4 hours ago</Chip>);
    expect(view.container.querySelector("i")).not.toBe(dot);
  });
});
