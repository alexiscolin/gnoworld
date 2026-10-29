import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eachStory } from "../testing.tsx";
import { Combobox, type ComboboxGroup } from "./Combobox.tsx";
import * as stories from "./Combobox.stories.tsx";

// Slice 5's 5n (docs/plans/slice-5.md §1): the ⌘K palette's field and list. Options in groups, each group named with its
// count; the focus stays in the field and the arrows move an active option (WAI-ARIA's combobox with a listbox popup).
const GROUPS: ComboboxGroup[] = [
  {
    id: "world",
    label: "Worlds",
    options: [
      { id: "/w/bubble", label: "Bubble" },
      { id: "/w/arcade", label: "Arcade" },
    ],
  },
  { id: "ecosystem", label: "Ecosystems", options: [{ id: "/e/tokens", label: "Tokens" }] },
];

const NOTHING = (): void => undefined;
function Held({ onSelect = NOTHING, groups = GROUPS }: { onSelect?: (id: string) => void; groups?: ComboboxGroup[] }) {
  const [value, setValue] = useState("");
  return <Combobox label="Search places" value={value} onValueChange={setValue} groups={groups} onSelect={onSelect} />;
}
const field = () => screen.getByRole("combobox", { name: "Search places" });
const active = () => field().getAttribute("aria-activedescendant");

// jsdom draws nothing, and has no scrollIntoView: the call is the test's.
const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

describe("Combobox", () => {
  it("is a combobox named by its label, which owns a listbox", () => {
    render(<Held />);
    expect(field().getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(field().getAttribute("aria-autocomplete")).toBe("list");
  });

  it("groups its options by their group's label and count, each group a named group of the listbox", () => {
    render(<Held />);
    expect(screen.getByRole("group", { name: /^Worlds\b.*\b2$/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: /^Ecosystems\b.*\b1$/ })).toBeTruthy();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Bubble", "Arcade", "Tokens"]);
  });

  it("calls onValueChange with what is typed", async () => {
    const onValueChange = vi.fn();
    render(
      <Combobox label="Search places" value="" onValueChange={onValueChange} groups={GROUPS} onSelect={vi.fn()} />,
    );
    await userEvent.type(field(), "b");
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("keeps the focus in the field while the arrows move the active option, the first at first", async () => {
    render(<Held />);
    await userEvent.click(field());
    expect(active()).toBeNull();
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).toBe(screen.getByRole("option", { name: "Bubble" }).id);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(active()).toBe(screen.getByRole("option", { name: "Tokens" }).id);
    expect(document.activeElement).toBe(field());
    expect(screen.getByRole("option", { name: "Tokens" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("option", { name: "Bubble" }).getAttribute("aria-selected")).toBe("false");
  });

  it("goes round the ends: down from the last is the first, up from the first is the last", async () => {
    render(<Held />);
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(active()).toBe(screen.getByRole("option", { name: "Bubble" }).id);
    await userEvent.keyboard("{ArrowUp}");
    expect(active()).toBe(screen.getByRole("option", { name: "Tokens" }).id);
  });

  it("chooses the active option with Enter, by its id, and nothing when none is active", async () => {
    const onSelect = vi.fn();
    render(<Held onSelect={onSelect} />);
    await userEvent.click(field());
    await userEvent.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("/w/arcade");
  });

  it("chooses an option by a click", async () => {
    const onSelect = vi.fn();
    render(<Held onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("option", { name: "Tokens" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("/e/tokens");
  });

  it("leaves Escape to the dialog around it: the key reaches it, and is not prevented", async () => {
    const outer = vi.fn();
    render(
      <div
        onKeyDown={(event) => {
          outer(event.key, event.defaultPrevented);
        }}
      >
        <Held />
      </div>,
    );
    await userEvent.click(field());
    await userEvent.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledWith("Escape", false);
  });

  it("does nothing on Enter that ends an input method's composition", async () => {
    const onSelect = vi.fn();
    render(<Held onSelect={onSelect} />);
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowDown}");
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("/w/bubble");
  });

  it("says plainly that nothing matches, in a status", () => {
    render(<Held groups={[]} />);
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.getByRole("status").textContent).toMatch(/no place/i);
  });

  it("says nothing in its status while there are options, and never describes the field by it", () => {
    render(<Held />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(field().getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText(/no place/i)).toBeNull();
  });

  it("has no listbox to own when nothing matches, and the field says it is not expanded", () => {
    render(<Held groups={[]} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(field().getAttribute("aria-expanded")).toBe("false");
    expect(field().hasAttribute("aria-controls")).toBe(false);
  });

  it("keeps the field still on the arrows and Enter with no option: nothing chosen, nothing active", async () => {
    const onSelect = vi.fn();
    render(<Held groups={[]} onSelect={onSelect} />);
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(active()).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it("shows the first 50 options of a group of 500, with the group's whole count, and goes round at the 50th", async () => {
    const many: ComboboxGroup[] = [
      {
        id: "world",
        label: "Worlds",
        options: Array.from({ length: 500 }, (_, n) => ({ id: `/w/${String(n)}`, label: `World ${String(n)}` })),
      },
    ];
    render(<Held groups={many} />);
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(screen.getByRole("group", { name: /^Worlds\b.*\b500$/ })).toBeTruthy();
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowUp}");
    expect(active()).toBe(screen.getByRole("option", { name: "World 49" }).id);
  });

  it("scrolls the active option into view as the arrows move", async () => {
    render(<Held />);
    await userEvent.click(field());
    expect(scrollIntoView).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole("option", { name: "Arcade" }));
  });

  it("drops the active option when the text changes, the options staying", async () => {
    render(<Held />);
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).not.toBeNull();
    await userEvent.keyboard("b");
    expect(active()).toBeNull();
  });

  it("draws a label that looks like markup as text", () => {
    const label = "<img src=x onerror=alert(1)>";
    render(<Held groups={[{ id: "world", label: "Worlds", options: [{ id: "/w/x", label }] }]} />);
    expect(screen.getByRole("option").textContent).toBe(label);
    expect(document.querySelector("img")).toBeNull();
  });

  it("drops the active option when the list changes under it", async () => {
    const { rerender } = render(
      <Combobox label="Search places" value="" onValueChange={vi.fn()} groups={GROUPS} onSelect={vi.fn()} />,
    );
    await userEvent.click(field());
    await userEvent.keyboard("{ArrowDown}");
    expect(active()).not.toBeNull();
    rerender(
      <Combobox label="Search places" value="t" onValueChange={vi.fn()} groups={GROUPS.slice(1)} onSelect={vi.fn()} />,
    );
    expect(active()).toBeNull();
  });

  it("has stories for the list, the empty list and a typed query", () => {
    const shown = eachStory(stories, (container) => ({
      options: container.querySelectorAll("[role='option']").length,
      empty: /no place/i.test(container.querySelector("[role='status']")?.textContent ?? ""),
    }));
    expect(shown.length).toBeGreaterThanOrEqual(3);
    expect(shown.some((s) => s.options > 0)).toBe(true);
    expect(shown.some((s) => s.empty)).toBe(true);
  });
});
