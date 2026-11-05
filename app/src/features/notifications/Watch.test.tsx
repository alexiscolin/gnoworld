// @vitest-environment jsdom
import { raised } from "../../../tests/pills.ts";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "../../../tests/mount.tsx";
import { StoreProvider } from "../../storeContext.tsx";
import { Watch } from "./Watch.tsx";

// The reminders while the page is open (slice 8; Alexis's answer 3; the threat model's "Reminder timers" and "The clock"): a reminder is told
// once in the top pill, ten minutes before or while live, and marked fired on the device, so a reload tells it no more; one over is marked
// and never told; one timer, the nearest within a day; nothing armed for an event 40 days ahead.
const START = Date.parse("2026-11-05T12:00:00.000Z");
const HOUR = 3_600_000;
const MINUTE = 60_000;
const data = vi.hoisted(() => ({
  events: [] as { id: string; title: string; start: string; link: string; world?: string }[],
}));
vi.mock("../../lateData.ts", () => ({
  get events() {
    return data.events;
  },
  news: [],
}));
vi.mock("../../topPill.tsx", () => import("../../../tests/pills.ts"));

const at = (id: string, start: number, world?: string) => ({
  id,
  title: `Event ${id}`,
  start: new Date(start).toISOString(),
  link: "https://gno.land/e",
  ...(world === undefined ? {} : { world }),
});
const asked = (reminders: Record<string, { fired: boolean }>) => {
  localStorage.setItem("gnoworld:device:reminders", JSON.stringify(reminders));
};
const kept = (): unknown => JSON.parse(localStorage.getItem("gnoworld:device:reminders") ?? "{}");

beforeEach(() => {
  vi.useFakeTimers({ now: START, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  localStorage.clear();
  raised.length = 0;
  data.events = [];
});
afterEach(() => {
  vi.useRealTimers();
});

function watching() {
  mount(
    <MemoryRouter>
      <StoreProvider>
        <Watch onCount={() => undefined} />
      </StoreProvider>
    </MemoryRouter>,
  );
}
const after = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("a reminder", () => {
  it("is told once ten minutes before its event, marked fired, and told no more on the next page", async () => {
    data.events = [at("e1", START + 15 * MINUTE, "bubble")];
    asked({ e1: { fired: false } });
    watching();
    expect(raised).toEqual([]);
    await after(5 * MINUTE);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ title: "Event e1", line: "Starts in a few minutes · Bubble" });
    expect(raised[0]?.action?.label).toBe("Go there");
    expect(kept()).toEqual({ e1: { fired: true } });
    await after(30 * MINUTE);
    expect(raised).toHaveLength(1);
    watching();
    await after(MINUTE);
    expect(raised).toHaveLength(1);
  });

  it("is told at the next open while its event is live, with no Go there for an event online", async () => {
    data.events = [at("e1", START - 20 * MINUTE)];
    asked({ e1: { fired: false } });
    watching();
    await after(0);
    expect(raised).toEqual([expect.objectContaining({ title: "Event e1", line: "Live now" })]);
    expect(raised[0]?.action).toBeUndefined();
  });

  it("is never told after its event is over (a gap), and is marked so it never is", async () => {
    data.events = [at("e1", START - 2 * HOUR)];
    asked({ e1: { fired: false } });
    watching();
    await after(0);
    expect(raised).toEqual([]);
    expect(kept()).toEqual({ e1: { fired: true } });
  });

  it("arms nothing for an event 40 days ahead, and tells nothing for a day of waiting", async () => {
    data.events = [at("far", START + 40 * 24 * HOUR)];
    asked({ far: { fired: false } });
    watching();
    expect(vi.getTimerCount()).toBe(1);
    await after(24 * HOUR);
    expect(raised).toEqual([]);
    expect(kept()).toEqual({ far: { fired: false } });
  });

  it("arms one timer for the nearest of several, and tells each in its turn", async () => {
    data.events = [at("b", START + 3 * HOUR), at("a", START + HOUR)];
    asked({ a: { fired: false }, b: { fired: false } });
    watching();
    // The minute's clock and the one reminder's timer.
    expect(vi.getTimerCount()).toBe(2);
    await after(HOUR - 10 * MINUTE);
    expect(raised.map(({ title }) => title)).toEqual(["Event a"]);
    await after(2 * HOUR);
    expect(raised.map(({ title }) => title)).toEqual(["Event a", "Event b"]);
    expect(kept()).toEqual({ a: { fired: true }, b: { fired: true } });
  });
});
