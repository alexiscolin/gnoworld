// @vitest-environment jsdom
import { stampKey, utcDay } from "@gnoworld/core";
import { afterEach, describe, expect, it } from "vitest";
import { createAppStore } from "../../store/index.ts";
import { visitedIn, visitKey } from "../../lib/visits.ts";
import { worldAsk } from "./globe.ts";

// What a world's page asks of the scene (8g, 8l): this reader's visit is kept on the device, as a flag the passport and the labels read, and
// a world this visit woke is stamped as charted by this device. A station keeps its visit as any world does, never the charting.
const CIRCLE = { x: 0, y: 0, radius: 100 };
const askOf = (id: string) => {
  const store = createAppStore();
  const page = { store, open: () => undefined, universe: "onyx", slug: id, path: `/w/${id}`, room: null };
  return { ask: worldAsk(CIRCLE, id, page), store };
};

afterEach(() => {
  localStorage.clear();
});

describe("a world's visit, kept for the scene", () => {
  it("knows a world as visited once its flag is on the device, and not before", () => {
    expect(askOf("adena").ask.visited).toBe(false);
    localStorage.setItem(visitKey("onyx", "adena"), "1");
    expect(askOf("adena").ask.visited).toBe(true);
  });

  it("keeps a visit as its flag of the universe and the world, for the passport and the labels to read", () => {
    const { ask } = askOf("adena");
    ask.remember(false);
    expect(localStorage.getItem(visitKey("onyx", "adena"))).not.toBeNull();
    expect(visitedIn("onyx")("adena")).toBe(true);
    expect(visitedIn("gnoland")("adena")).toBe(false);
    expect(visitedIn("onyx")("gnoscan")).toBe(false);
  });

  it("charts a world this visit woke by its stamp key and the day, and charts none for a visit that woke nothing", () => {
    const woke = askOf("adena");
    woke.ask.remember(true);
    expect(woke.store.getState().device.charted).toEqual({ [stampKey("onyx", "adena")]: utcDay(new Date()) });
    const stood = askOf("gnoscan");
    stood.ask.remember(false);
    expect(stood.store.getState().device.charted).toEqual({});
  });

  it("keeps the first day of a world charted twice", () => {
    const { ask, store } = askOf("adena");
    store.getState().deviceActions.change("charted", () => ({ [stampKey("onyx", "adena")]: "2026-01-02" }));
    ask.remember(true);
    expect(store.getState().device.charted).toEqual({ [stampKey("onyx", "adena")]: "2026-01-02" });
  });
});
