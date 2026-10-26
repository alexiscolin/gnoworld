import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../Button/IconButton.tsx";
import { eachStory, staysText, toggled } from "../testing.tsx";
import { Menu, Popover } from "./Popover.tsx";
import * as stories from "./Popover.stories.tsx";

// jsdom has no popover API: the test setup's stand-in opens one by its trigger, as the browser does.
// Light dismiss, Esc and the placement are the stories' journeys'.
// A popover holding a button, opened by its trigger, the focus on the button inside: its panel.
async function focusedInside() {
  render(
    <Popover trigger="Network" label="Choose the network">
      <button type="button">Switch to Onyx</button>
    </Popover>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Network" }));
  screen.getByRole("button", { name: "Switch to Onyx" }).focus();
  return screen.getByRole("dialog");
}

describe("Popover", () => {
  it("is opened by its trigger, a button that names it and says it pops up", async () => {
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
    await toggled();
    expect(screen.getByRole("dialog", { name: "Choose the network" }).contains(screen.getByText("Onyx"))).toBe(true);
  });

  it("gives the focus back to its trigger when it closes with the focus inside it", async () => {
    (await focusedInside()).hidePopover();
    await toggled();
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
    await toggled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search" }));
  });

  it("gives the focus back to its trigger when the browser drops it on the page as it closes", async () => {
    const panel = await focusedInside();
    // As a browser that focuses nothing on a click does: the focus falls to the page as the panel hides.
    panel.addEventListener("beforetoggle", () => {
      screen.getByRole("button", { name: "Switch to Onyx" }).blur();
    });
    panel.hidePopover();
    await toggled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Network" }));
  });

  it("leaves the focus on the page when it closes with the focus there, never pulling it to the trigger", async () => {
    render(
      <Popover trigger="Network" label="Choose the network">
        <p>Onyx</p>
      </Popover>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Network" }));
    screen.getByRole("button", { name: "Network" }).blur();
    screen.getByRole("dialog").hidePopover();
    await toggled();
    expect(document.activeElement).toBe(document.body);
  });

  it("listens to the page's scroll and size only while open, and stops when it closes", async () => {
    const listened = vi.spyOn(window, "addEventListener");
    render(
      <Popover trigger="Network" label="Choose the network">
        <p>Onyx</p>
      </Popover>,
    );
    const placing = () => listened.mock.calls.filter(([type]) => type === "scroll" || type === "resize");
    expect(placing()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Network" }));
    const signals = placing().flatMap(([, , options]) =>
      typeof options === "object" && options.signal !== undefined ? [options.signal] : [],
    );
    expect(signals).toHaveLength(2);
    act(() => {
      screen.getByRole("dialog").hidePopover();
    });
    await toggled();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    listened.mockRestore();
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

  it("leaves a key held with a modifier to the browser", async () => {
    const all = await opened();
    expect(fireEvent.keyDown(item(all, 0), { key: "End", ctrlKey: true })).toBe(true);
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

  // An item that opens a dialog: the dialog gives the focus back, as it closes, to what held it as it opened (F905).
  it("acts with the focus on its trigger, never on its hidden item", async () => {
    let focused: Element | null = null;
    await opened(
      vi.fn(() => {
        focused = document.activeElement;
      }),
    );
    await userEvent.keyboard("{Enter}");
    expect(focused).toBe(screen.getByRole("button", { name: "More" }));
  });

  it("opens again after it closed, placed and its first item focused", async () => {
    const all = await opened();
    screen.getByRole("menu").hidePopover();
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0] ?? all[0]);
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

  // 4c's message menu (docs/decisions.md, 2026-10-26): a trigger of an icon alone, its words its name and tooltip.
  it("draws an icon for its trigger when given one, named by its words, which its tooltip shows", async () => {
    render(<Menu trigger="More" icon="more" label="Message actions" items={items} />);
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.querySelector("svg")?.dataset["icon"]).toBe("more");
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    const tip = screen.getByText("More");
    expect(tip.closest("[aria-hidden='true']")).not.toBeNull();
    expect(trigger.contains(tip)).toBe(false);
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
  });

  it("wears an icon trigger as an IconButton does: square, outline unless asked plain", () => {
    render(
      <>
        <Menu trigger="More" icon="more" label="Message actions" items={items} />
        <Menu trigger="Plain" icon="more" emphasis="plain" label="Message actions" items={items} />
        <IconButton icon="more" label="Alike" />
        <IconButton icon="more" label="Plain alike" emphasis="plain" />
      </>,
    );
    const look = (name: string) => {
      const { className, dataset } = screen.getByRole("button", { name });
      return [className, dataset["emphasis"], dataset["tone"], dataset["size"]];
    };
    expect(look("More")).toEqual(look("Alike"));
    expect(look("Plain")).toEqual(look("Plain alike"));
    // The green pass (G16): the look stated apart from iconLook, which both sides above call.
    expect(look("More").slice(1)).toEqual(["outline", "neutral", "m"]);
    expect(look("Plain").slice(1)).toEqual(["plain", "neutral", "m"]);
    expect(screen.getByRole("button", { name: "More" }).querySelector("svg")?.dataset["size"]).toBe("m");
  });

  // The red pass (M13): the words name the trigger, as text, and the trigger draws none of them.
  it("names an icon trigger by its words, made of markup or very long, as text, drawing none of them", () => {
    for (const text of ["<b>More</b>", `More ${"x".repeat(400)}`]) {
      const { unmount } = render(<Menu trigger={text} icon="more" label="Message actions" items={items} />);
      const trigger = screen.getByRole("button", { name: text });
      expect(trigger.textContent).toBe("");
      expect(trigger.querySelector("b")).toBeNull();
      unmount();
    }
  });
});
