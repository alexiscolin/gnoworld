// @vitest-environment jsdom
import { stampKey, utcDay, worldIdOf } from "@gnoworld/core";
import { raised } from "../../../tests/pills.ts";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountInStore, type AppStore } from "../../../tests/inStore.tsx";
import { plug } from "../../slots.tsx";
import { Arrival } from "./Arrival.tsx";

// A place's arrival (slice 8; frames 23, 93): its first visit stamps the passport once, with the UTC day, and says so in one pill;
// a world already stamped says only 8b's line, if any; a world this visit charted first says "First to chart", with its Share. Nothing is
// written before the device is read, and nothing over a device that could not be.
vi.mock("../../topPill.tsx", () => import("../../../tests/pills.ts"));

const line = vi.fn<(...args: unknown[]) => Promise<string | undefined>>(() => Promise.resolve(undefined));
const share = vi.fn();
plug("arrivalLine", (...args) => line(...args));
plug("share", (place) => {
  share(place);
});

let store: AppStore | undefined;
const stamps = (): Record<string, string> =>
  JSON.parse(localStorage.getItem("gnoworld:device:stamps") ?? "{}") as Record<string, string>;

async function arrive(world = "bubble", name = "Bubble") {
  const mounted = await mountInStore(<Arrival universe="onyx" world={world} name={name} path={`/w/${world}`} />);
  store = mounted.store;
  await act(async () => {
    await Promise.resolve();
  });
}

const reported: unknown[] = [];
beforeEach(() => {
  reported.length = 0;
  vi.stubGlobal("reportError", (error: unknown) => {
    reported.push(error);
  });
  localStorage.clear();
  raised.length = 0;
  line.mockClear();
  line.mockImplementation(() => Promise.resolve(undefined));
  share.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  expect(reported).toEqual([]);
});

describe("an arrival", () => {
  it("stamps a first visit with today's UTC day, and says so in one pill with the passport a press away", async () => {
    await arrive();
    const key = stampKey("onyx", "bubble");
    expect(stamps()).toEqual({ [key]: utcDay(new Date()) });
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ title: "Stamped · Bubble", line: "1 stamp in your passport" });
    expect(raised[0]?.action?.label).toBe("Passport");
    expect(line).toHaveBeenCalledWith(
      { key, universe: "onyx", name: "Bubble", day: utcDay(new Date()), stamped: true },
      expect.any(Function),
    );
  });

  it("counts the stamps of the universe alone", async () => {
    localStorage.setItem(
      "gnoworld:device:stamps",
      JSON.stringify({ "onyx:gov/dao": "2026-11-01", "gnoland:gov/dao": "2026-11-01" }),
    );
    await arrive();
    expect(raised[0]?.line).toBe("2 stamps in your passport");
  });

  it("stamps a world once: a second visit keeps its first day and raises no pill", async () => {
    const key = stampKey("onyx", "bubble");
    localStorage.setItem("gnoworld:device:stamps", JSON.stringify({ [key]: "2026-11-01" }));
    await arrive();
    expect(stamps()).toEqual({ [key]: "2026-11-01" });
    expect(raised).toEqual([]);
    expect(line).toHaveBeenCalledWith(expect.objectContaining({ stamped: false }), expect.any(Function));
  });

  it("says 8b's line under Stamped, in the same pill, never a second one", async () => {
    line.mockImplementation(() => Promise.resolve("Today's expedition · 1 of 3"));
    await arrive();
    expect(raised).toEqual([
      expect.objectContaining({ title: "Stamped · Bubble", line: "Today's expedition · 1 of 3" }),
    ]);
  });

  it("says 8b's line alone, under the world's name, at a world already stamped", async () => {
    localStorage.setItem("gnoworld:device:stamps", JSON.stringify({ [stampKey("onyx", "bubble")]: "2026-11-01" }));
    line.mockImplementation(() => Promise.resolve("Today's expedition · 2 of 3"));
    await arrive();
    expect(raised).toEqual([expect.objectContaining({ title: "Bubble", line: "Today's expedition · 2 of 3" })]);
  });

  it("names a realm's world as the expedition does, not by its folder", async () => {
    await arrive(worldIdOf("gno.land/r/samcrew/connect4"), "connect4");
    expect(raised[0]?.title).toBe("Stamped · Connect 4");
  });

  it("writes no stamp to a device that could not be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem");
    set.mockClear();
    await arrive();
    expect(set).not.toHaveBeenCalled();
    expect(raised).toEqual([]);
  });

  it("says First to chart, with its Share, when the visit that stamped it charts the world", async () => {
    await arrive();
    const key = stampKey("onyx", "bubble");
    act(() => {
      store?.getState().deviceActions.change("charted", (held) => ({ ...held, [key]: utcDay(new Date()) }));
    });
    const first = raised.at(-1);
    expect(first).toMatchObject({ title: "First to chart · Bubble", line: "Charted first on this device" });
    expect(first?.action?.label).toBe("Share");
    first?.action?.onAction();
    expect(share).toHaveBeenCalledWith({ name: "Bubble", path: "/w/bubble" });
  });

  it("says nothing of a world charted on a visit that did not stamp it", async () => {
    const key = stampKey("onyx", "bubble");
    localStorage.setItem("gnoworld:device:stamps", JSON.stringify({ [key]: "2026-11-01" }));
    await arrive();
    act(() => {
      store?.getState().deviceActions.change("charted", (held) => ({ ...held, [key]: "2026-11-05" }));
    });
    expect(raised).toEqual([]);
  });
});
