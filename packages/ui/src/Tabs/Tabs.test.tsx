import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Tabs, type Tab } from "./Tabs.tsx";
import * as stories from "./Tabs.stories.tsx";

const views: Tab[] = [
  { id: "earth", label: "Earth" },
  { id: "cosmos", label: "Cosmos" },
  { id: "list", label: "List", count: 12 },
];

// Tabs as a page holds them: the selected one is its state.
function Held({ start = "earth" as string | null }) {
  const [selected, setSelected] = useState(start);
  return <Tabs label="Views" tabs={views} selected={selected} onSelect={setSelected} />;
}

// The keyboard on the held tabs, from the tab that holds the focus: where it lands, selected.
async function press(from: string, keys: string) {
  render(<Held start={from} />);
  await userEvent.tab();
  await userEvent.keyboard(keys);
  return document.activeElement === screen.getByRole("tab", { selected: true }) ? document.activeElement : null;
}

describe("Tabs", () => {
  it("is a tablist named by its label, one tab per item, the selected one said", () => {
    render(<Tabs label="Views" tabs={views} selected="cosmos" onSelect={vi.fn()} />);
    expect(screen.getByRole("tablist", { name: "Views" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(screen.getByRole("tab", { name: "List 12" })).toBeTruthy();
  });

  it("lets the keyboard reach the selected tab alone, or the first when none is", () => {
    const { rerender } = render(<Tabs label="Views" tabs={views} selected="cosmos" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    rerender(<Tabs label="Views" tabs={views} selected={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getAllByRole("tab").every((t) => t.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("lets the keyboard reach the first tab when the selected one is gone from the list", () => {
    render(<Tabs label="Views" tabs={views} selected="removed" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab").map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("selects by a click", async () => {
    const onSelect = vi.fn();
    render(<Tabs label="Views" tabs={views} selected="earth" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("tab", { name: "Cosmos" }));
    expect(onSelect).toHaveBeenCalledWith("cosmos");
  });

  it("moves to the next tab and selects it with the right arrow", async () => {
    expect(await press("earth", "{ArrowRight}")).toBe(screen.getByRole("tab", { name: "Cosmos" }));
  });

  it("goes round from the last tab to the first with the right arrow", async () => {
    expect(await press("list", "{ArrowRight}")).toBe(screen.getByRole("tab", { name: "Earth" }));
  });

  it("moves back with the left arrow", async () => {
    expect(await press("cosmos", "{ArrowLeft}")).toBe(screen.getByRole("tab", { name: "Earth" }));
  });

  it("goes round from the first tab to the last with the left arrow", async () => {
    expect(await press("earth", "{ArrowLeft}")).toBe(screen.getByRole("tab", { name: "List 12" }));
  });

  it("goes to the first tab with Home", async () => {
    expect(await press("cosmos", "{Home}")).toBe(screen.getByRole("tab", { name: "Earth" }));
  });

  it("goes to the last tab with End", async () => {
    expect(await press("cosmos", "{End}")).toBe(screen.getByRole("tab", { name: "List 12" }));
  });

  it("keeps the page from scrolling on the keys it takes", () => {
    render(<Held />);
    const tab = screen.getByRole("tab", { name: "Earth" });
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"])
      expect(fireEvent.keyDown(tab, { key }), key).toBe(false);
    expect(fireEvent.keyDown(tab, { key: "a" })).toBe(true);
  });

  it("leaves a key held with a modifier to the browser: Alt and an arrow is Back", () => {
    const onSelect = vi.fn();
    render(<Tabs label="Views" tabs={views} selected="cosmos" onSelect={onSelect} />);
    const tab = screen.getByRole("tab", { name: "Cosmos" });
    for (const held of ["altKey", "ctrlKey", "metaKey", "shiftKey"])
      expect(fireEvent.keyDown(tab, { key: "ArrowLeft", [held]: true }), held).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("turns the arrows round in a right-to-left page", async () => {
    render(
      <div dir="rtl">
        <Held />
      </div>,
    );
    await userEvent.tab();
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Cosmos", selected: true }));
  });

  it("shows no count of nothing, and names its tab by its label alone then", () => {
    render(
      <Tabs label="Calls" tabs={[{ id: "calls", label: "Calls", count: 0 }]} selected="calls" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("tab", { name: "Calls" }).textContent).toBe("Calls");
  });

  it("shows a tab's label beside its icon unless asked for the icon alone", () => {
    render(
      <Tabs label="Filter" tabs={[{ id: "all", label: "All", icon: "chat" }]} selected="all" onSelect={vi.fn()} />,
    );
    const tab = screen.getByRole("tab", { name: "All" });
    expect([tab.textContent, tab.querySelector("svg")?.dataset["icon"]]).toEqual(["All", "chat"]);
    expect(tab.hasAttribute("aria-label")).toBe(false);
  });

  it("names an icon-only tab by its label, shows its icon, and wears its label as a tooltip", () => {
    render(
      <Tabs
        label="Filter"
        tabs={[{ id: "all", label: "All messages", icon: "chat" }]}
        selected="all"
        onSelect={vi.fn()}
        iconOnly
      />,
    );
    const tab = screen.getByRole("tab", { name: "All messages" });
    expect(tab.querySelector("svg")?.dataset["icon"]).toBe("chat");
    const tip = screen.getByText("All messages");
    expect(tip.closest("[aria-hidden='true']")).not.toBeNull();
    expect(tab.contains(tip)).toBe(false);
  });

  it("shows labels made of markup, or very long, as text", () => {
    staysText((text) => <Tabs label="Views" tabs={[{ id: "a", label: text }]} selected="a" onSelect={vi.fn()} />);
    staysText((text) => <Tabs label={text} tabs={[{ id: "a", label: "a" }]} selected="a" onSelect={vi.fn()} />);
  });

  it("has stories with counts, icons only, and none selected", () => {
    const shown = eachStory(stories, (container) => ({
      tabs: container.querySelectorAll("[role='tab']").length,
      selected: container.querySelectorAll("[aria-selected='true']").length,
      icons: container.querySelectorAll("[role='tab'] svg").length,
      counted: [...container.querySelectorAll("[role='tab']")].some((t) => /\d/.test(t.textContent)),
    }));
    expect(shown.every((s) => s.tabs > 1)).toBe(true);
    expect(shown.some((s) => s.selected === 0)).toBe(true);
    expect(shown.some((s) => s.icons === s.tabs)).toBe(true);
    expect(shown.some((s) => s.counted)).toBe(true);
  });
});
