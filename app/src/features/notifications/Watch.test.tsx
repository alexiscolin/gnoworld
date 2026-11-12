// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore } from "../../../tests/inStore.tsx";
import { Watch } from "./Watch.tsx";

const START = Date.parse("2026-11-05T12:00:00.000Z");
const HOUR = 3_600_000;
const MINUTE = 60_000;
const data = vi.hoisted(() => ({
  events: [] as { id: string; title: string; start: string; link: string; world?: string }[],
  news: [] as { id: string; title: string; date: string; link: string }[],
}));
vi.mock("../../lateData.ts", () => ({
  get events() {
    return data.events;
  },
  get news() {
    return data.news;
  },
}));

const at = (id: string, start: number, world?: string) => ({
  id,
  title: `Event ${id}`,
  start: new Date(start).toISOString(),
  link: "https://gno.land/e",
  ...(world === undefined ? {} : { world }),
});

beforeEach(() => {
  vi.useFakeTimers({ now: START, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  localStorage.clear();
  data.events = [];
  data.news = [];
});
afterEach(() => {
  vi.useRealTimers();
});

// The bell's count: one for each unread line of the three kinds the page holds without asking (messages, the coming and live events,
// the news of 14 days), none for the worlds followed, which the panel alone asks the server for.
describe("the bell's count", () => {
  const noted = {
    id: "m1",
    kind: "mention" as const,
    where: "#bubble",
    time: new Date(START).toISOString(),
    by: "alice",
  };
  const counted = async () => {
    const counts: number[] = [];
    const { store } = await mountInStore(<Watch onCount={(count) => counts.push(count)} />);
    return { store, last: () => counts.at(-1) };
  };

  it("adds a message, an event of the coming day and a fresh news item, and leaves out the old and the far", async () => {
    data.events = [at("soon", START + 3 * HOUR), at("far", START + 3 * 24 * HOUR)];
    data.news = [
      { id: "n1", title: "New", date: new Date(START - 2 * 24 * HOUR).toISOString(), link: "https://gno.land/n" },
      { id: "n2", title: "Old", date: new Date(START - 15 * 24 * HOUR).toISOString(), link: "https://gno.land/o" },
    ];
    const { store, last } = await counted();
    expect(last()).toBe(2);
    act(() => {
      store.getState().chatActions.follow(["#bubble"]);
      store.getState().noticeActions.add(noted);
    });
    expect(last()).toBe(3);
  });

  it("counts a live event, and drops a line from the count once it is read by its id", async () => {
    data.events = [at("live", START - 20 * MINUTE)];
    const { store, last } = await counted();
    expect(last()).toBe(1);
    act(() => {
      store.getState().deviceActions.change("notificationsRead", (held) => ({ ...held, ids: ["event:live"] }));
    });
    expect(last()).toBe(0);
  });
});
