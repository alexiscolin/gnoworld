// @vitest-environment jsdom
import { UNDATED_EVENT } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, modals, noMedia } from "../../../tests/mount.tsx";
import { mountInStore } from "../../../tests/inStore.tsx";
import { Calendar } from "./Calendar.tsx";

// The calendar (slice 8; frames of the dock's Events): an agenda by the reader's local day, the live ones for an hour, those without a date
// last with no time and no reminder, one world's or every world's, and "Remind me" kept on the device.
const data = vi.hoisted(() => ({
  events: [] as { id: string; title: string; start: string; link: string; world?: string }[],
}));
vi.mock("../../lateData.ts", () => ({
  get events() {
    return data.events;
  },
  news: [],
}));

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const local = (day: number, time: string) => {
  const [hour = 0, minute = 0, second = 0] = time.split(":").map(Number);
  return new Date(2026, 10, day, hour, minute, second).toISOString();
};
const event = (id: string, start: string, world?: string) => ({
  id,
  title: `Event ${id}`,
  start,
  link: "https://gno.land/e",
  ...(world === undefined ? {} : { world }),
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  modals();
  localStorage.clear();
  data.events = [];
  noMedia();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function opened(world = "earth") {
  const mounted = await mountInStore(<Calendar world={world} open onClose={() => undefined} />);
  return { ...mounted, page: document.body };
}
const sections = (page: HTMLElement) =>
  all(page, "section[aria-label]").map((each) => [
    each.getAttribute("aria-label"),
    all(each, "h3 ~ *").map((row) => row.textContent),
  ]);

describe("the calendar's agenda", () => {
  it("groups by the reader's local day: 23:59:59 today, 00:00:00 tomorrow", async () => {
    data.events = [event("b", local(6, "00:00:00")), event("a", local(5, "23:59:59"))];
    const { page } = await opened();
    const [today, tomorrow] = sections(page);
    expect(today?.[0]).toBe("Today");
    expect(today?.[1]).toHaveLength(1);
    expect(String(today?.[1]?.[0])).toContain("Event a");
    expect(tomorrow?.[0]).toBe("Tomorrow");
    expect(String(tomorrow?.[1]?.[0])).toContain("Event b");
  });

  it("names a later day by its weekday and date", async () => {
    data.events = [event("c", local(9, "10:00"))];
    const { page } = await opened();
    const label = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(
      new Date(2026, 10, 9),
    );
    expect(sections(page).map(([name]) => name)).toEqual([label]);
  });

  it("keeps an event live for one hour from its start, with no reminder to ask, and drops it after", async () => {
    data.events = [
      event("live", new Date(NOW.getTime() - 59 * 60_000).toISOString()),
      event("over", new Date(NOW.getTime() - 61 * 60_000).toISOString()),
    ];
    const { page } = await opened();
    expect(page.textContent).toContain("Event live");
    expect(page.textContent).toContain("Live now");
    expect(page.textContent).not.toContain("Event over");
    expect(button(page, "Remind me: Event live")).toBeUndefined();
    expect(button(page, "Reminder set: Event live")).toBeUndefined();
  });

  it("puts an undated event last, with no time and no Remind me", async () => {
    data.events = [event("later", new Date(UNDATED_EVENT).toISOString()), event("soon", local(5, "18:00"))];
    const { page } = await opened();
    expect(sections(page).map(([name]) => name)).toEqual(["Today", "Date to be confirmed"]);
    expect(button(page, "Remind me: Event soon")).toBeDefined();
    expect(button(page, "Remind me: Event later")).toBeUndefined();
    expect(String(sections(page)[1]?.[1]?.[0])).toMatch(/^Event later(?!.* · )/);
  });

  it("says nothing is planned for an empty agenda", async () => {
    const { page } = await opened();
    expect(page.textContent).toContain("Nothing planned");
  });
});

describe("the calendar's worlds", () => {
  it("shows the world's own events first and every world's on the other button", async () => {
    data.events = [event("mine", local(5, "18:00"), "bubble"), event("far", local(5, "19:00"), "earth")];
    const { page } = await opened("bubble");
    expect(page.textContent).toContain("Event mine");
    expect(page.textContent).not.toContain("Event far");
    click(button(page, "Every world"));
    expect(page.textContent).toContain("Event mine");
    expect(page.textContent).toContain("Event far");
    click(button(page, "Bubble"));
    expect(page.textContent).not.toContain("Event far");
  });

  it("shows every world's, with no choice, for a world the data plans nothing in", async () => {
    data.events = [event("far", local(5, "19:00"), "earth")];
    const { page } = await opened("bubble");
    expect(page.textContent).toContain("Event far");
    expect(button(page, "Every world")).toBeUndefined();
  });

  it("says Online for an event with no world, and leads to the world's page otherwise", async () => {
    data.events = [event("net", local(5, "18:00")), event("there", local(5, "19:00"), "bubble")];
    const { page } = await opened();
    expect(page.textContent).toContain("Online");
    expect(button(page, "Open Event net")).toBeDefined();
    expect(button(page, "Open Event there")).toBeUndefined();
    expect(page.textContent).toContain("Go there");
  });
});

describe("an event's link off the site", () => {
  it("opens the warning naming the event's host, holds the link only inside it, and goes nowhere unasked", async () => {
    const link = "https://talks.example.org/e/net?x=1";
    data.events = [{ ...event("net", local(5, "18:00")), link }];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { page } = await opened();
    const linksTo = () => all(page, "a").filter((each) => each.getAttribute("href") === link);
    expect(linksTo()).toHaveLength(0);
    expect(all(page, "dialog").filter((dialog) => dialog.textContent.includes("Leaving this page"))).toHaveLength(0);
    click(button(page, "Open Event net"));
    const warnings = all(page, "dialog").filter(
      (dialog) => dialog.querySelector("dialog") === null && dialog.textContent.includes("Leaving this page"),
    );
    expect(warnings).toHaveLength(1);
    const warning = warnings[0];
    expect(warning?.hasAttribute("open")).toBe(true);
    expect(warning?.textContent).toContain(new URL(link).host);
    const links = linksTo();
    expect(links).toHaveLength(1);
    expect(warning?.contains(links[0] ?? null)).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("Remind me", () => {
  it("keeps the reminder on the device, unfired, and takes it off on a second press", async () => {
    data.events = [event("r", local(5, "18:00"))];
    const { page, store } = await opened();
    click(button(page, "Remind me: Event r"));
    expect(store.getState().device.reminders).toEqual({ r: { fired: false } });
    expect(button(page, "Reminder set: Event r")?.getAttribute("aria-pressed")).toBe("true");
    click(button(page, "Reminder set: Event r"));
    expect(store.getState().device.reminders).toEqual({});
    expect(button(page, "Remind me: Event r")).toBeDefined();
  });
});
