// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, modals, noMedia, popovers, settled } from "../../../tests/mount.tsx";
import { mountInStore } from "../../../tests/inStore.tsx";
import { Panel } from "./Panel.tsx";

// The bell's panel (slice 8; frames 86, 87): the kinds with what is unread in each, the worlds to filter by, a followed world where people
// are, a line off the site opened only through the warning, Mark all read; Esc and a press outside close it.
vi.mock("../../lib/api/presence.ts", () => ({
  pagePresenceApi: () => ({
    read: () =>
      Promise.resolve({
        ok: true,
        value: { worlds: [{ world: "bubble", here: 4, perHour: 0, rise: null }] },
      }),
  }),
}));
const data = vi.hoisted(() => {
  const soon = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  return {
    events: [
      { id: "e-bubble", title: "Bubble's game night", start: soon, link: "https://gno.land/e", world: "bubble" },
      { id: "e-online", title: "An online call", start: soon, link: "https://example.com/call" },
    ],
    news: [{ id: "n1", title: "A word from the team", date: today, link: "https://gno.land/news" }],
  };
});
vi.mock("../../lateData.ts", () => data);

beforeAll(() => {
  popovers();
  modals();
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("gnoworld:device:follows", JSON.stringify({ worlds: ["onyx:bubble"], people: [] }));
  vi.stubGlobal("reportError", (error: unknown) => {
    throw error;
  });
  noMedia();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function opened(onClose = () => undefined) {
  await mountInStore(<Panel onClose={onClose} />);
  await settled(() => document.body.textContent.includes("a world you follow"));
  return document.body;
}
const unreadMarks = (page: HTMLElement) => all(page, "[data-unread]").length;
const press = (page: HTMLElement, name: string) => {
  const found = all(page, "button, [role='tab']").find(
    (each) => (each.getAttribute("aria-label") ?? each.textContent.trim()) === name,
  );
  expect(found, name).toBeDefined();
  act(() => {
    found?.click();
  });
};
const tabs = (page: HTMLElement) =>
  all(page, "[role='tab']").map((tab) => tab.textContent.replaceAll(/\s+/g, " ").trim());
const lines = (page: HTMLElement) => all(page, "ol li").map((line) => line.textContent);

describe("the bell's panel", () => {
  it("shows a followed world where people are, first and unread, with the events and the news", async () => {
    const page = await opened();
    expect(lines(page)[0]).toContain("Bubble, a world you follow: 4 here now");
    expect(lines(page)).toHaveLength(4);
    expect(unreadMarks(page)).toBe(4);
  });

  it("counts what is unread in each kind", async () => {
    const page = await opened();
    expect(tabs(page)).toEqual(["All 4", "Messages", "Worlds 3", "News 1"]);
  });

  it("shows one kind alone, and one world alone", async () => {
    const page = await opened();
    press(page, "News 1");
    expect(lines(page)).toHaveLength(1);
    expect(lines(page)[0]).toContain("A word from the team");
    press(page, "All 4");
    const bubble = all(page, "[role='group'] button").find((chip) => chip.textContent === "Bubble");
    act(() => {
      bubble?.click();
    });
    expect(lines(page).every((line) => line.includes("Bubble"))).toBe(true);
    expect(lines(page)).toHaveLength(2);
  });

  it("opens a line off the site only through the warning, naming its host, and stays open", async () => {
    const onClose = vi.fn();
    const page = await opened(onClose);
    press(page, "Open: An online call");
    const warning = all(document, "dialog").find((dialog) => dialog.textContent.includes("Leaving this page"));
    expect(warning?.hasAttribute("open")).toBe(true);
    expect(warning?.textContent).toContain("example.com");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc and on a press outside it", async () => {
    const onClose = vi.fn();
    await opened(onClose);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    const outside = document.createElement("p");
    document.body.append(outside);
    act(() => {
      outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes on no press inside it, nor on the bell, which toggles it itself", async () => {
    const onClose = vi.fn();
    const page = await opened(onClose);
    const bell = document.createElement("span");
    bell.dataset["bell"] = "";
    document.body.append(bell);
    act(() => {
      bell.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      all(page, "ol li")[0]?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
