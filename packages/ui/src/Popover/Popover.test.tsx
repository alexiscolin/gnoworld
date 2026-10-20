import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { eachStory, staysText } from "../testing.tsx";
import { Menu, Popover } from "./Popover.tsx";
import * as stories from "./Popover.stories.tsx";

// jsdom has no popover API: the test setup's stand-in opens one by its trigger, as the browser does.
// Light dismiss, Esc and the placement are the stories' journeys'.
describe("Popover", () => {
  it("is opened by its trigger, a button that names it and says it pops up", () => {
    render(
      <Popover trigger="Network" label="Choose the network">
        <p>Onyx</p>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: "Network" });
    const panel = screen.getByText("Onyx").closest("[popover]");
    expect(panel?.getAttribute("popover")).toBe("auto");
    expect(trigger.getAttribute("popovertarget")).toBe(panel?.id);
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose the network" }).contains(screen.getByText("Onyx"))).toBe(true);
  });

  it("gives the focus back to its trigger when it closes with the focus inside it", async () => {
    render(
      <Popover trigger="Network" label="Choose the network">
        <button type="button">Switch to Onyx</button>
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Network" }));
    screen.getByRole("button", { name: "Switch to Onyx" }).focus();
    screen.getByRole("dialog").hidePopover();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Network" }));
  });

  it("leaves the focus where it went when it closes with the focus elsewhere", async () => {
    render(
      <>
        <Popover trigger="Network" label="Choose the network">
          <p>Onyx</p>
        </Popover>
        <button type="button">Search</button>
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Network" }));
    screen.getByRole("button", { name: "Search" }).focus();
    screen.getByRole("dialog").hidePopover();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search" }));
  });

  it("gives each popover an id of its own", () => {
    render(
      <>
        <Popover trigger="One" label="One">
          <p>a</p>
        </Popover>
        <Popover trigger="Two" label="Two">
          <p>b</p>
        </Popover>
      </>,
    );
    const ids = [...document.querySelectorAll("[popover]")].map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("shows words made of markup, or very long, as text", () => {
    staysText((text) => (
      <Popover trigger={text} label={text}>
        <p>{text}</p>
      </Popover>
    ));
  });

  it("has stories for an anchored popover and a menu", () => {
    const shown = eachStory(stories, (container) => container.querySelector("[popover]")?.getAttribute("role"));
    expect(shown).toContain("menu");
    expect(shown).toContain("dialog");
  });
});

describe("Menu", () => {
  const items = [
    { label: "Copy", onSelect: vi.fn() },
    { label: "Room link", onSelect: vi.fn() },
    { label: "Report", onSelect: vi.fn() },
  ];

  // The menu opened from its trigger, as a click does: its items, the first one focused.
  async function opened(onSelect = vi.fn()) {
    render(<Menu trigger="More" label="Message actions" items={items.map((item) => ({ ...item, onSelect }))} />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    return screen.getAllByRole("menuitem");
  }

  function item(all: HTMLElement[], at: number) {
    const found = all.at(at);
    if (found === undefined) throw new Error(`no item ${String(at)}`);
    return found;
  }

  it("is a menu of menu items, its trigger saying so", async () => {
    const all = await opened();
    expect(screen.getByRole("button", { name: "More" }).getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.getByRole("menu", { name: "Message actions" })).toBeTruthy();
    expect(all.map((i) => i.textContent)).toEqual(["Copy", "Room link", "Report"]);
  });

  it("focuses its first item as it opens", async () => {
    const all = await opened();
    expect(document.activeElement).toBe(item(all, 0));
  });

  it("moves down with the down arrow, and round from the last item to the first", async () => {
    const all = await opened();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(item(all, 1));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(item(all, 0));
  });

  it("moves up with the up arrow, and round from the first item to the last", async () => {
    const all = await opened();
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item(all, -1));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(item(all, 1));
  });

  it("goes to the last item with End and the first with Home", async () => {
    const all = await opened();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(item(all, -1));
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(item(all, 0));
  });

  it("keeps the page from scrolling on the keys it takes", async () => {
    const all = await opened();
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End"])
      expect(fireEvent.keyDown(item(all, 0), { key }), key).toBe(false);
  });

  it("does an item's act on Enter, once, closes, and gives the focus back to its trigger", async () => {
    const onSelect = vi.fn();
    await opened(onSelect);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("does an item's act on a click, once, and closes", async () => {
    const onSelect = vi.fn();
    const all = await opened(onSelect);
    await userEvent.click(item(all, 2));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes when Tab leaves it", async () => {
    await opened();
    await userEvent.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps its items out of the tab order: the arrows move among them", async () => {
    const all = await opened();
    expect(all.map((i) => i.tabIndex)).toEqual([-1, -1, -1]);
  });

  it("shows its trigger, label and items made of markup, or very long, as text", () => {
    staysText((text) => <Menu trigger={text} label={text} items={[{ label: text, onSelect: vi.fn() }]} />);
  });
});
