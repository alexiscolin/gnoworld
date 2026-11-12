// @vitest-environment jsdom
import type { JarvisTranslateRequest, JarvisTranslation } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "./lib/api/http.ts";

// A room's lines translated as they come on screen: asked once a line and a language, newest first, one after another up to ASKS_A_MINUTE
// in any minute, kept on the device.
type Ask = (request: JarvisTranslateRequest) => Promise<Result<JarvisTranslation>>;
const ok = (value: JarvisTranslation): Result<JarvisTranslation> => ({ ok: true, value });
const HELLO = { status: "translated", text: "Bonjour", from: "en" } as const;

// A fresh module each test: its memory is the page's.
async function fresh() {
  vi.resetModules();
  return import("./translating.ts");
}
type T = Awaited<ReturnType<typeof fresh>>;
const now = (t: T, id = "a1") => t.translationNow({ room: "#bubble", id, language: "fr" });
// The gathering of lines that came together (GATHER_MS), after which the first ask goes.
const settle = () => vi.advanceTimersByTimeAsync(100);
// A step of time well past an ask's own, to let the queue run.
const STEP = 2500;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("asking a line's translation", () => {
  it("asks with the room, the line and the language, and holds the translation with its original's language", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok(HELLO)));
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await settle();
    expect(ask).toHaveBeenCalledWith({ room: "#bubble", msgid: "a1", language: "fr" });
    expect(now(t)).toEqual({ state: "done", text: "Bonjour", from: "en", hidden: false });
  });

  it("asks once a line and a language, and not at all for one it holds", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok(HELLO)));
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 3);
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 3);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks the newest line that came on screen first, then the others at once, one after another, never waiting between them", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok(HELLO)));
    for (const id of ["a1", "a2", "a3"]) t.wantTranslation({ room: "#bubble", id, language: "fr" }, ask);
    await settle();
    await vi.advanceTimersByTimeAsync(100);
    expect(ask.mock.calls.map(([sent]) => sent.msgid)).toEqual(["a3", "a2", "a1"]);
  });

  it("keeps under the door's rate: ASKS_A_MINUTE asks in any minute, the next once the first of them is a minute old", async () => {
    const t = await fresh();
    const times: number[] = [];
    const ask = vi.fn<Ask>(() => {
      times.push(Date.now());
      return Promise.resolve(ok(HELLO));
    });
    for (let at = 0; at < 30; at += 1)
      t.wantTranslation({ room: "#bubble", id: `l${String(at)}`, language: "fr" }, ask);
    await settle();
    await vi.advanceTimersByTimeAsync(100);
    expect(ask).toHaveBeenCalledTimes(t.ASKS_A_MINUTE);
    expect(t.ASKS_A_MINUTE).toBeLessThan(30);
    // The first ask went at 100 ms: none more till it is a minute old, then the rest as the first ones get a minute old.
    await vi.advanceTimersByTimeAsync(60_000 - 250);
    expect(ask).toHaveBeenCalledTimes(t.ASKS_A_MINUTE);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ask).toHaveBeenCalledTimes(30);
    for (let at = t.ASKS_A_MINUTE; at < 30; at += 1)
      expect((times[at] ?? 0) - (times[at - t.ASKS_A_MINUTE] ?? 0)).toBeGreaterThanOrEqual(60_000);
  });

  it("drops a line that left the screen before its turn", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok(HELLO)));
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    t.wantTranslation({ room: "#bubble", id: "a2", language: "fr" }, ask);
    const leave = t.wantTranslation({ room: "#bubble", id: "a3", language: "fr" }, ask);
    leave();
    t.wantTranslation({ room: "#bubble", id: "a4", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 5);
    expect(ask.mock.calls.map(([sent]) => sent.msgid)).toEqual(["a4", "a2", "a1"]);
  });

  it("keeps a translation and an original on the device: a reload shows them and asks nothing", async () => {
    const first = await fresh();
    const ask = vi.fn<Ask>(({ msgid }) => Promise.resolve(ok(msgid === "a1" ? HELLO : { status: "original" })));
    first.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    first.wantTranslation({ room: "#bubble", id: "a2", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 3);
    const reloaded = await fresh();
    const again = vi.fn<Ask>();
    reloaded.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, again);
    reloaded.wantTranslation({ room: "#bubble", id: "a2", language: "fr" }, again);
    await vi.advanceTimersByTimeAsync(STEP * 3);
    expect(again).not.toHaveBeenCalled();
    expect(now(reloaded)).toMatchObject({ state: "done", text: "Bonjour", hidden: false });
    expect(now(reloaded, "a2")).toEqual({ state: "same" });
  });

  it("holds a line that came back original as drawn nowhere", async () => {
    const t = await fresh();
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, () => Promise.resolve(ok({ status: "original" })));
    await settle();
    expect(now(t)).toEqual({ state: "same" });
  });

  it("retries a refusal for the rate later, the line kept in the queue", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>().mockResolvedValueOnce({ ok: false, reason: "too_many" }).mockResolvedValue(ok(HELLO));
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(t.RETRY_MS - 1);
    expect(ask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(now(t)?.state).toBe("done");
  });

  it("leaves a line whose ask failed as it is, never asked again by this page", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve({ ok: false, reason: "unavailable" }));
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 2);
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(STEP * 2);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(now(t)).toEqual({ state: "failed" });
  });

  it.each(["spent", "off"] as const)(
    "stops the queue on %s, once, with the reason held for the room",
    async (status) => {
      const t = await fresh();
      const ask = vi.fn<Ask>(() => Promise.resolve(ok({ status })));
      for (const id of ["a1", "a2", "a3"]) t.wantTranslation({ room: "#bubble", id, language: "fr" }, ask);
      t.wantTranslation({ room: "#bubble", id: "a4", language: "fr" }, ask);
      await vi.advanceTimersByTimeAsync(STEP * 6);
      expect(ask).toHaveBeenCalledTimes(1);
      expect(t.translationHalt()).toBe(status);
      t.wantTranslation({ room: "#bubble", id: "a5", language: "fr" }, ask);
      await vi.advanceTimersByTimeAsync(STEP * 6);
      expect(ask).toHaveBeenCalledTimes(1);
      expect(now(t, "a4")).toBeUndefined();
    },
  );

  it("folds a translation away and brings it back, the original never touched", async () => {
    const t = await fresh();
    t.wantTranslation({ room: "#bubble", id: "a1", language: "fr" }, () => Promise.resolve(ok(HELLO)));
    await settle();
    t.foldTranslation({ room: "#bubble", id: "a1", language: "fr" }, true);
    expect(now(t)).toMatchObject({ state: "done", hidden: true });
    t.foldTranslation({ room: "#bubble", id: "a1", language: "fr" }, false);
    expect(now(t)).toMatchObject({ hidden: false });
  });

  it("asks a number of lines on screen once each: 50 lines make 50 asks, within three minutes", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok(HELLO)));
    for (let at = 0; at < 50; at += 1)
      t.wantTranslation({ room: "#bubble", id: `l${String(at)}`, language: "fr" }, ask);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(ask).toHaveBeenCalledTimes(50);
  });
});
