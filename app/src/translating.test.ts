// @vitest-environment jsdom
import type { LineTranslations, TranslationEvent } from "@gnoworld/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "./lib/api/http.ts";
import type { Language } from "./lib/language.ts";

// A room's lines translated as they come on screen: the stored translations asked of the server in batches of at most 30, never one by
// one, and the stream's events put in the same store.
type Ask = (room: string, ids: readonly string[], language: Language) => Promise<Result<LineTranslations>>;
const ok = (over: Partial<LineTranslations> = {}): Result<LineTranslations> => ({
  ok: true,
  value: { room: "#bubble", language: "fr", translations: [], pending: [], ...over },
});
const HELLO = { msgid: "a1", status: "translated", text: "Bonjour", from: "en" } as const;

async function fresh() {
  vi.resetModules();
  return import("./translating.ts");
}
type T = Awaited<ReturnType<typeof fresh>>;
const want = (t: T, id: string, ask: Ask) => t.wantTranslation({ room: "#bubble", id, language: "fr" }, ask);
const wantDe = (t: T, id: string, ask: Ask) => t.wantTranslation({ room: "#bubble", id, language: "de" }, ask);
const now = (t: T, id = "a1", language: "fr" | "de" = "fr") => t.translationNow({ room: "#bubble", id, language });
const settle = () => vi.advanceTimersByTimeAsync(100);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("asking the stored translations of the lines on screen", () => {
  it("asks the lines that came together in one request, the newest first, after a short gathering", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok()));
    for (const id of ["a1", "a2", "a3"]) want(t, id, ask);
    expect(ask).not.toHaveBeenCalled();
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("#bubble", ["a3", "a2", "a1"], "fr");
  });

  it("holds a stored translation as done with its original's language, and an original as same", async () => {
    const t = await fresh();
    const ask = () => Promise.resolve(ok({ translations: [HELLO, { msgid: "a2", status: "original" as const }] }));
    want(t, "a1", ask);
    want(t, "a2", ask);
    await settle();
    expect(now(t)).toEqual({ state: "done", text: "Bonjour", from: "en", hidden: false });
    expect(now(t, "a2")).toEqual({ state: "same" });
  });

  it("asks 31 lines in two requests of 30 and 1, one after the other, never one by one", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok()));
    for (let at = 0; at < 31; at += 1) want(t, `l${String(at)}`, ask);
    await settle();
    await vi.advanceTimersByTimeAsync(10);
    expect(ask.mock.calls.map(([, ids]) => ids.length)).toEqual([30, 1]);
  });

  it("asks a room's two languages apart, and asks nothing again for a line it holds, is asking or has failed", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ pending: ["a1"] })));
    want(t, "a1", ask);
    wantDe(t, "a1", ask);
    want(t, "a1", ask);
    await settle();
    await vi.advanceTimersByTimeAsync(10);
    expect(ask.mock.calls.map(([, ids, language]) => [ids.join(), language]).toSorted()).toEqual([
      ["a1", "de"],
      ["a1", "fr"],
    ]);
    want(t, "a1", ask);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("drops a line that left the screen before the request went", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok()));
    want(t, "a1", ask);
    const leave = want(t, "a2", ask);
    leave();
    await settle();
    expect(ask).toHaveBeenCalledWith("#bubble", ["a1"], "fr");
  });

  it("shows a line the server is still making as asking, and a line it left out as failed", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ pending: ["a1"] })));
    want(t, "a1", ask);
    want(t, "a2", ask);
    await settle();
    expect(now(t)).toEqual({ state: "asking" });
    expect(now(t, "a2")).toEqual({ state: "failed" });
  });

  it("takes the translation of a line it was told is asking from the stream's event", async () => {
    const t = await fresh();
    want(t, "a1", () => Promise.resolve(ok({ pending: ["a1"] })));
    await settle();
    const event: TranslationEvent = {
      room: "#bubble",
      msgid: "a1",
      language: "fr",
      status: "translated",
      text: "Salut",
    };
    t.translationsTold([event, { room: "#bubble", msgid: "a9", language: "fr", status: "original" }]);
    expect(now(t)).toMatchObject({ state: "done", text: "Salut" });
    expect(now(t, "a9")).toEqual({ state: "same" });
  });

  it("clears a line's translation when the stream tells it gone (edited or hidden), and holds the new one that follows", async () => {
    const t = await fresh();
    t.translationsTold([{ room: "#bubble", msgid: "a1", language: "fr", status: "translated", text: "Salut" }]);
    t.translationsTold([{ room: "#bubble", msgid: "a1", language: "fr", status: "gone" }]);
    expect(now(t)).toBeUndefined();
    t.translationsTold([{ room: "#bubble", msgid: "a1", language: "fr", status: "translated", text: "Encore" }]);
    expect(now(t)).toMatchObject({ state: "done", text: "Encore" });
  });

  it("asks a line the server left for later again after RETRY_MS, asking meanwhile", async () => {
    const t = await fresh();
    const ask = vi
      .fn<Ask>()
      .mockResolvedValueOnce(ok({ translations: [HELLO], later: ["a2"] }))
      .mockResolvedValue(ok({ translations: [{ msgid: "a2", status: "original" }] }));
    want(t, "a1", ask);
    want(t, "a2", ask);
    await settle();
    expect(now(t, "a2")).toEqual({ state: "asking" });
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    expect(ask).toHaveBeenLastCalledWith("#bubble", ["a2"], "fr");
    expect(now(t, "a2")).toEqual({ state: "same" });
  });

  it("asks a line left asking whose stream never told it again after RETRY_MS, a bounded number of times, then fails it", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ pending: ["a1"] })));
    want(t, "a1", ask);
    await settle();
    await vi.advanceTimersByTimeAsync(t.RETRY_MS * 10);
    expect(ask.mock.calls.length).toBeGreaterThan(1);
    expect(ask.mock.calls.length).toBeLessThanOrEqual(3);
    expect(now(t)).toEqual({ state: "failed" });
  });

  it("does not ask again a pending line the stream told meanwhile", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ pending: ["a1"] })));
    want(t, "a1", ask);
    await settle();
    t.translationsTold([{ room: "#bubble", msgid: "a1", language: "fr", status: "original" }]);
    await vi.advanceTimersByTimeAsync(t.RETRY_MS * 3);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(now(t)).toEqual({ state: "same" });
  });

  it("asks nothing for a line the stream already told", async () => {
    const t = await fresh();
    t.translationsTold([{ room: "#bubble", msgid: "a1", language: "fr", status: "translated", text: "Salut" }]);
    const ask = vi.fn<Ask>(() => Promise.resolve(ok()));
    want(t, "a1", ask);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks again after a refusal for the rate, later, the lines kept", async () => {
    const t = await fresh();
    const ask = vi
      .fn<Ask>()
      .mockResolvedValueOnce({ ok: false, reason: "too_many" })
      .mockResolvedValue(ok({ translations: [HELLO] }));
    want(t, "a1", ask);
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(t.RETRY_MS - 1);
    expect(ask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(now(t)?.state).toBe("done");
  });

  it("leaves lines whose request failed as failed, never asked again by this page", async () => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve({ ok: false, reason: "unavailable" }));
    want(t, "a1", ask);
    await settle();
    want(t, "a1", ask);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(now(t)).toEqual({ state: "failed" });
  });

  it("asks the lines of a request the network dropped again after RETRY_MS, a bounded number of times", async () => {
    const t = await fresh();
    const ask = vi
      .fn<Ask>()
      .mockResolvedValueOnce({ ok: false, reason: "network" })
      .mockResolvedValueOnce({ ok: false, reason: "network" })
      .mockResolvedValue(ok({ translations: [HELLO] }));
    want(t, "a1", ask);
    await settle();
    expect(now(t)).toEqual({ state: "asking" });
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(now(t)).toMatchObject({ state: "done", text: "Bonjour" });
    const down = vi.fn<Ask>(() => Promise.resolve({ ok: false, reason: "network" }));
    want(t, "b1", down);
    await settle();
    await vi.advanceTimersByTimeAsync(t.RETRY_MS * 10);
    expect(down).toHaveBeenCalledTimes(3);
    expect(now(t, "b1")).toEqual({ state: "failed" });
  });

  it("asks again once the UTC day after a spent budget has begun, and tells the room the halt is over", async () => {
    vi.setSystemTime(new Date("2026-11-13T23:59:00.000Z"));
    const t = await fresh();
    const ask = vi
      .fn<Ask>()
      .mockResolvedValueOnce(ok({ halt: "spent" }))
      .mockResolvedValue(ok({ translations: [HELLO] }));
    want(t, "b1", ask);
    await settle();
    expect(t.translationHalt()).toBe("spent");
    want(t, "a1", ask);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ask).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.translationHalt()).toBeUndefined();
    want(t, "a1", ask);
    await settle();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(now(t)).toMatchObject({ state: "done" });
  });

  it("keeps Jarvis being off for the page: no new day asks again", async () => {
    vi.setSystemTime(new Date("2026-11-13T23:59:00.000Z"));
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ halt: "off" })));
    want(t, "b1", ask);
    await settle();
    await vi.advanceTimersByTimeAsync(2 * 86_400_000);
    want(t, "a1", ask);
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(t.translationHalt()).toBe("off");
  });

  it.each(["spent", "off"] as const)("stops asking on %s, the reason held for the room", async (halt) => {
    const t = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ halt })));
    want(t, "a1", ask);
    await settle();
    expect(t.translationHalt()).toBe(halt);
    want(t, "a2", ask);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(now(t, "a2")).toBeUndefined();
  });

  it("holds a room's newest 400 translations the stream told, the oldest dropped", async () => {
    const t = await fresh();
    const told = Array.from({ length: 1000 }, (_, n) => ({
      room: "#bubble",
      msgid: `m${String(n)}`,
      language: "fr" as const,
      status: "original" as const,
    }));
    t.translationsTold(told);
    expect(now(t, "m0")).toBeUndefined();
    expect(now(t, "m599")).toBeUndefined();
    expect(now(t, "m600")).toEqual({ state: "same" });
    expect(now(t, "m999")).toEqual({ state: "same" });
  });

  it("holds each language of a room apart: a reader back in French after German keeps the French of the lines in view", async () => {
    const t = await fresh();
    const told = (language: "fr" | "de", from: number, to: number) => {
      t.translationsTold(
        Array.from({ length: to - from }, (_, n) => ({
          room: "#bubble",
          msgid: `m${String(from + n)}`,
          language,
          status: "original" as const,
        })),
      );
    };
    told("fr", 0, 200);
    told("de", 0, 200);
    told("fr", 200, 205);
    expect(now(t, "m199")).toEqual({ state: "same" });
    expect(now(t, "m0")).toEqual({ state: "same" });
    expect(now(t, "m0", "de")).toEqual({ state: "same" });
  });

  it("drops first the translations of lines the room's store no longer holds, then the oldest", async () => {
    const t = await fresh();
    const range = (from: number, to: number) => Array.from({ length: to - from }, (_, n) => `m${String(from + n)}`);
    let inStore = range(200, 400);
    t.translationLines((room) => (room === "#bubble" ? inStore.map((id) => ({ id })) : undefined));
    const told = (ids: readonly string[]) => {
      t.translationsTold(
        ids.map((msgid) => ({ room: "#bubble", msgid, language: "fr" as const, status: "original" as const })),
      );
    };
    told(range(200, 400));
    inStore = range(0, 200);
    told(range(0, 200));
    inStore = range(200, 400);
    told(["m400"]);
    expect(now(t, "m200")).toEqual({ state: "same" });
    expect(now(t, "m400")).toEqual({ state: "same" });
    expect(now(t, "m0")).toBeUndefined();
    expect(now(t, "m1")).toEqual({ state: "same" });
  });

  it("drops no line still being asked to make room: its tries still count, and a third answer that leaves it fails it", async () => {
    const t = await fresh();
    let answer: (result: Result<LineTranslations>) => void = () => undefined;
    const ask = vi.fn<Ask>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    want(t, "a1", ask);
    await settle();
    answer(ok({ pending: ["a1"] }));
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    answer(ok({ pending: ["a1"] }));
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    expect(ask).toHaveBeenCalledTimes(3);
    t.translationsTold(
      Array.from({ length: 500 }, (_, n) => ({
        room: "#bubble",
        msgid: `m${String(n)}`,
        language: "fr" as const,
        status: "original" as const,
      })),
    );
    expect(now(t)).toEqual({ state: "asking" });
    answer(ok({ pending: ["a1"] }));
    await vi.advanceTimersByTimeAsync(t.RETRY_MS * 3);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(now(t)).toEqual({ state: "failed" });
  });

  it("asks a line its full tries again once a refusal for the rate put it back", async () => {
    const t = await fresh();
    const ask = vi
      .fn<Ask>()
      .mockResolvedValueOnce(ok({ pending: ["a1"] }))
      .mockResolvedValueOnce({ ok: false, reason: "too_many" })
      .mockResolvedValue(ok({ pending: ["a1"] }));
    want(t, "a1", ask);
    await settle();
    await vi.advanceTimersByTimeAsync(t.RETRY_MS + t.GATHER_MS);
    await vi.advanceTimersByTimeAsync(t.RETRY_MS * 10);
    expect(ask).toHaveBeenCalledTimes(5);
    expect(now(t)).toEqual({ state: "failed" });
  });

  it("folds a translation away and brings it back, the original never touched", async () => {
    const t = await fresh();
    want(t, "a1", () => Promise.resolve(ok({ translations: [HELLO] })));
    await settle();
    t.foldTranslation({ room: "#bubble", id: "a1", language: "fr" }, true);
    expect(now(t)).toMatchObject({ state: "done", hidden: true });
    t.foldTranslation({ room: "#bubble", id: "a1", language: "fr" }, false);
    expect(now(t)).toMatchObject({ hidden: false });
  });

  it("keeps nothing on the device: a reload asks the server again", async () => {
    const first = await fresh();
    want(first, "a1", () => Promise.resolve(ok({ translations: [HELLO] })));
    await settle();
    const reloaded = await fresh();
    const ask = vi.fn<Ask>(() => Promise.resolve(ok({ translations: [HELLO] })));
    want(reloaded, "a1", ask);
    await settle();
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
