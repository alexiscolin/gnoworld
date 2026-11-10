// @vitest-environment jsdom
import { hubWorldOf } from "@gnoworld/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import hubs from "../../../data/hubs.json" with { type: "json" };
import type { Space } from "../../space/scene.ts";

// P401, P301: the moons' asking and looking end with their view, stand still while the tab is hidden, and tell the scene only what changed.
const asked = vi.hoisted(() => vi.fn());
vi.mock("../../lib/query/apiReads.ts", () => ({ activityOptions: (slug: string) => ({ slug }) }));
vi.mock("../../lib/query/client.ts", () => ({
  queryClient: {
    query: (options: { slug: string }) => {
      asked(options.slug);
      return Promise.resolve({
        rooms: [
          { world: options.slug, room: `#${options.slug}`, perMinute: 2 },
          { world: options.slug, room: `#${options.slug}/other`, perMinute: 1 },
        ],
      });
    },
  },
}));
vi.mock("../../lib/query/api.ts", () => ({
  resultOf: async (read: Promise<unknown>) => ({ ok: true, value: await read }),
}));

const { feedMoons, stopMoons } = await import("./moonRooms.ts");
const hub = hubs[0];
const place = { kind: "world", id: hub === undefined ? "" : hubWorldOf(hub) } as const;
const rooms = vi.fn();
const space = { stage: { moons: { rooms } } } as unknown as Space;
const hide = (value: boolean) => Object.defineProperty(document, "hidden", { value, configurable: true });

beforeEach(() => {
  vi.stubGlobal("reportError", (error: unknown) => {
    throw error;
  });
  vi.useFakeTimers();
  hide(false);
  history.replaceState(null, "", "/");
});
afterEach(() => {
  stopMoons();
  vi.useRealTimers();
  asked.mockClear();
  rooms.mockClear();
});

describe("the moons' feed", () => {
  it("asks no more once stopped, and asks at once when a world shows again", async () => {
    feedMoons(space, place);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveBeenCalledTimes(1);
    stopMoons();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toHaveBeenCalledTimes(1);
    feedMoons(space, place);
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("tells the scene the same list once, not each two seconds, and nothing while hidden", async () => {
    feedMoons(space, place);
    await vi.advanceTimersByTimeAsync(1);
    const told = rooms.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rooms.mock.calls.length).toBe(told);
    hide(true);
    history.replaceState(null, "", "?room=other");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rooms.mock.calls.length).toBe(told);
  });

  it("follows the address once the tab is seen again, and not while it is hidden", async () => {
    feedMoons(space, place);
    await vi.advanceTimersByTimeAsync(1);
    const told = rooms.mock.calls.length;
    hide(true);
    history.replaceState(null, "", "?room=other");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rooms.mock.calls.length).toBe(told);
    hide(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(rooms.mock.calls.length).toBe(told + 1);
    history.replaceState(null, "", "/");
  });
});
