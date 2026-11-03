import { parseLine, statusOrbit } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { WorldFeed } from "./feed.ts";
import { readingOf } from "./reading.ts";

// What a world's view is told, and from where (ADR-0002 §3): the people present in the world's rooms, the times of their lines, the
// worlds' file read once, and whether this reader came before, which a first visit records so a reload never wakes a world twice.
const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;
const FRESH: Worlds = {
  version: 1,
  universe: "onyx",
  updated: "2026-11-02T11:59:00Z",
  worlds: [
    {
      id: "bubble",
      namespace: "bubble",
      realms: [
        {
          path: "gno.land/r/bubble",
          deployer: null,
          deployerName: null,
          functions: [],
          imports: [],
          calls: null,
          callers: null,
          lastHeight: null,
        },
      ],
      seen: new Date(NOW - DAY).toISOString(),
    },
  ],
};

function line(room: string, id: string, at: number) {
  const parsed = parseLine(
    `@msgid=${id};time=${new Date(at).toISOString()};account=alice :alice!u@h PRIVMSG ${room} :hi`,
  );
  if (!parsed.ok) throw new Error("the test's line does not parse");
  return parsed.message;
}

// `null` is a file that never came.
function parts(file: Worlds | null = FRESH, visited = false) {
  const store = createAppStore();
  store.getState().chatActions.follow(["#bubble", "#bubble/games"]);
  store.setState((state) => ({
    chat: {
      ...state.chat,
      rooms: {
        "#bubble": { ...(state.chat.rooms["#bubble"] ?? never()), members: ["alice", "bob"] },
        "#bubble/games": { ...(state.chat.rooms["#bubble/games"] ?? never()), members: ["bob", "carol"] },
      },
    },
  }));
  const view = { read: vi.fn(), ring: vi.fn() };
  const remember = vi.fn();
  const feed = new WorldFeed(view, {
    universe: "onyx",
    id: "bubble",
    page: { store, open: vi.fn(), slug: "bubble", room: null, universe: "onyx", path: "/w/bubble" },
    file: () => Promise.resolve(file ?? undefined),
    visited,
    remember,
    now: () => NOW,
  });
  return { store, view, feed, remember };
}

function never(): never {
  throw new Error("a followed room is missing");
}

const settled = async () => {
  for (let task = 0; task < 6; task += 1) await new Promise((done) => setTimeout(done));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a world's feed", () => {
  it("reads the world from its file and its rooms: the people once each, the lines' times", async () => {
    const { store, view, feed } = parts();
    store.getState().chatActions.heard(line("#bubble", "a1", NOW - 60_000));
    await settled();
    feed.refresh();
    expect(view.read).toHaveBeenLastCalledWith(
      readingOf(FRESH, { universe: "onyx", id: "bubble", people: 3, lines: [NOW - 60_000], visited: false, now: NOW }),
    );
  });

  it("wakes a fresh world on this reader's first visit and has it remembered; a reader who came before sees no wake", async () => {
    const first = parts();
    await settled();
    first.feed.refresh();
    expect(first.view.read.mock.lastCall?.[0]).toMatchObject({ wake: true });
    expect(first.remember).toHaveBeenCalled();
    first.feed.dispose();
    const again = parts(FRESH, true);
    await settled();
    again.feed.refresh();
    expect(again.view.read.mock.lastCall?.[0]).toMatchObject({ wake: false });
    expect(again.remember).not.toHaveBeenCalled();
  });

  // The appearance plays on any world's first visit (Alexis, 2026-11-03), kept as the wake is: an old world, or one whose file never came.
  it("has any world's first visit remembered, a seed or not, so a reload never plays its appearance again", async () => {
    const old = parts({ ...FRESH, worlds: FRESH.worlds.map((world) => ({ ...world, seen: "2026-01-01T00:00:00Z" })) });
    await settled();
    expect(old.view.read.mock.lastCall?.[0]).toMatchObject({ first: true, wake: false });
    expect(old.remember).toHaveBeenCalled();
    const lost = parts(null);
    await settled();
    expect(lost.view.read.mock.lastCall?.[0]).toMatchObject({ first: true, wake: false });
    expect(lost.remember).toHaveBeenCalled();
    const again = parts(FRESH, true);
    await settled();
    expect(again.view.read.mock.lastCall?.[0]).toMatchObject({ first: false });
    expect(again.remember).not.toHaveBeenCalled();
  });

  it("keeps the wake through the visit though it was remembered at its start, so it plays to its end", async () => {
    const { view, feed } = parts();
    await settled();
    feed.refresh();
    feed.refresh();
    // The first read comes before the file: no world in it, no wake.
    expect(view.read.mock.calls.slice(1).every(([reading]) => (reading as { wake: boolean }).wake)).toBe(true);
  });

  it("reads again when its rooms change, once a second at most", async () => {
    vi.useFakeTimers({ now: NOW });
    const { store, view } = parts();
    await vi.advanceTimersByTimeAsync(0);
    const before = view.read.mock.calls.length;
    for (let at = 0; at < 20; at += 1) store.getState().chatActions.heard(line("#bubble", `b${String(at)}`, NOW - at));
    await vi.advanceTimersByTimeAsync(999);
    expect(view.read.mock.calls.length - before).toBeLessThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(view.read.mock.calls.length - before).toBeGreaterThanOrEqual(1);
    expect(view.read.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it("draws the page's ring on the world's orbit, and none when the page has none", () => {
    const { view, feed } = parts();
    feed.ring({ lit: 0.33, mark: 0.6666 });
    expect(view.ring).toHaveBeenLastCalledWith(statusOrbit({ lit: 0.33, mark: 0.6666 }));
    feed.ring(undefined);
    expect(view.ring).toHaveBeenLastCalledWith(undefined);
  });

  it("stops listening to the rooms when it is disposed", async () => {
    const { store, view, feed } = parts();
    await settled();
    feed.dispose();
    const before = view.read.mock.calls.length;
    store.getState().chatActions.heard(line("#bubble", "c1", NOW));
    await new Promise((done) => setTimeout(done, 1100));
    expect(view.read.mock.calls.length).toBe(before);
  });
});
