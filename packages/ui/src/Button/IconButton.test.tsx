import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { storiesOf, staysText, type Unstyled } from "../testing.tsx";
import { IconButton, type IconButtonProps } from "./IconButton.tsx";
import * as stories from "./IconButton.stories.tsx";

const noOutsideStyling: Unstyled<IconButtonProps> = true;

// The visible count: the one element in the button that is neither its icon nor empty.
function countOf(button: HTMLElement) {
  return button.querySelector("[aria-hidden='true']:not(svg)")?.textContent ?? null;
}

describe("IconButton", () => {
  it("accepts no className or style", () => {
    expect(noOutsideStyling).toBe(true);
  });

  it("is a button named by its label alone, its icon hidden", () => {
    render(<IconButton icon="search" label="Search the room" />);
    const button = screen.getByRole("button", { name: "Search the room" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(button.querySelector("svg")?.dataset["icon"]).toBe("search");
    expect(button.textContent).toBe("");
  });

  it("is outline and medium unless asked otherwise, with the 16 px icon", () => {
    render(<IconButton icon="bell" label="Notifications" />);
    const button = screen.getByRole("button");
    expect([button.dataset["emphasis"], button.dataset["size"]]).toEqual(["outline", "m"]);
    expect(button.querySelector("svg")?.dataset["size"]).toBe("m");
  });

  it.each([
    ["plain", "s", "m"],
    ["outline", "l", "l"],
  ] as const)("shows emphasis %s and size %s, with the icon at %s", (emphasis, size, iconSize) => {
    render(<IconButton icon="bell" label="Notifications" emphasis={emphasis} size={size} />);
    const button = screen.getByRole("button");
    expect([button.dataset["emphasis"], button.dataset["size"]]).toEqual([emphasis, size]);
    expect(button.querySelector("svg")?.dataset["size"]).toBe(iconSize);
  });

  it("says whether it is pressed only when it toggles", () => {
    const { rerender } = render(<IconButton icon="star" label="Save the room" />);
    expect(screen.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
    rerender(<IconButton icon="star" label="Save the room" pressed />);
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
    rerender(<IconButton icon="star" label="Save the room" pressed={false} />);
    expect(screen.getByRole("button", { pressed: false })).toBeTruthy();
  });

  it.each([
    [1, "1"],
    [8, "8"],
    [99, "99"],
    [100, "99+"],
    [1000, "99+"],
  ])("shows a count of %i as %s, hidden since its label says it", (count, shown) => {
    render(<IconButton icon="bell" label={`Notifications, ${String(count)} unread`} count={count} />);
    expect(countOf(screen.getByRole("button", { name: `Notifications, ${String(count)} unread` }))).toBe(shown);
  });

  it.each([0, -1, Number.NaN])("shows no count for %s", (count) => {
    render(<IconButton icon="bell" label="Notifications" count={count} />);
    expect(screen.getByRole("button").textContent).toBe("");
  });

  it("calls its handler on a click", async () => {
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Close" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps a label made of markup, or very long, as its name and nothing else", () => {
    staysText((text) => <IconButton icon="bell" label={text} />);
  });

  it("has named stories for each size, both emphases, a pressed one and a count past 99", () => {
    const shown = storiesOf(stories).flatMap(({ element }) => {
      const { unmount } = render(element);
      const buttons = screen.getAllByRole("button").map((b) => ({
        named: (b.getAttribute("aria-label") ?? "") !== "",
        emphasis: b.dataset["emphasis"],
        size: b.dataset["size"],
        pressed: b.getAttribute("aria-pressed"),
        count: countOf(b),
      }));
      unmount();
      return buttons;
    });
    expect(shown.every((b) => b.named)).toBe(true);
    for (const size of ["s", "m", "l"]) expect(shown.some((b) => b.size === size)).toBe(true);
    for (const emphasis of ["outline", "plain"]) expect(shown.some((b) => b.emphasis === emphasis)).toBe(true);
    expect(shown.some((b) => b.pressed === "true") && shown.some((b) => b.count === "99+")).toBe(true);
  });
});
