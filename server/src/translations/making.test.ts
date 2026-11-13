import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import type { Translate } from "./flow.ts";
import { makeMaker, type Outcome } from "./making.ts";
import { TranslationStore } from "./store.ts";

// The guards on jarvis's translate calls: one call a line and language whoever asks, 4 at once, 200 waiting (the oldest dropped), a stop
// that lets every waiting making go, and a call that throws counted as failed.
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const made: Awaited<ReturnType<Translate>> = {
  ok: true,
  answer: { status: "translated", text: "Bonjour", from: "en" },
};

// A translate that answers once released, and gives up when the maker stops.
const held = () => {
  const open: (() => void)[] = [];
  let calls = 0;
  const translate: Translate = (_request, signal) =>
    new Promise((resolve, reject) => {
      calls += 1;
      open.push(() => {
        resolve(made);
      });
      signal.addEventListener("abort", () => {
        reject(new Error("stopped"));
      });
    });
  return { translate, open, calls: () => calls };
};

function setup(translate: Translate) {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const clock = { now: T0 };
  const logged: { event: string; fields: unknown }[] = [];
  const maker = makeMaker({
    store: new TranslationStore(db, () => clock.now),
    translate,
    publish: () => undefined,
    log: (event, fields) => void logged.push({ event, fields }),
    now: () => clock.now,
  });
  return { maker, clock, logged };
}

const line = (n: number) => ({ room: "#bubble", msgid: `m${String(n)}` });

describe("making a translation", () => {
  it("calls jarvis once for two asks of one line and language at once, both told its outcome", async () => {
    const jarvis = held();
    const { maker } = setup(jarvis.translate);
    const first = maker.make(line(1), "Hello", "fr");
    const second = maker.make(line(1), "Hello", "fr");
    expect(second).toBe(first);
    await Promise.resolve();
    jarvis.open.shift()?.();
    expect([await first, await second]).toEqual(["stored", "stored"]);
    expect(jarvis.calls()).toBe(1);
  });

  it("drops the oldest waiting making as limit once 4 run and 200 wait, and never calls jarvis for it", async () => {
    const jarvis = held();
    const t = setup(jarvis.translate);
    const outcomes: Promise<Outcome>[] = [];
    for (let n = 0; n < 205; n += 1) {
      // The breaker lets 60 through a minute: each minute's 60 come under a new one.
      if (n > 0 && n % 60 === 0) t.clock.now += 60_001;
      outcomes.push(t.maker.make(line(n), "Hello", "fr"));
    }
    expect(await outcomes[4]).toBe("limit");
    expect(jarvis.calls()).toBe(4);
    t.maker.stop();
    await t.maker.idle();
  });

  it("lets every waiting making go as limit on stop, and a making asked after it is off", async () => {
    const jarvis = held();
    const t = setup(jarvis.translate);
    const outcomes = [0, 1, 2, 3, 4, 5].map((n) => t.maker.make(line(n), "Hello", "fr"));
    await Promise.resolve();
    t.maker.stop();
    expect(await Promise.all(outcomes)).toEqual(["failed", "failed", "failed", "failed", "limit", "limit"]);
    expect(await t.maker.make(line(6), "Hello", "fr")).toBe("off");
    expect(jarvis.calls()).toBe(4);
  });

  it("counts a translate that throws as failed, logs it by the room, and frees its slot", async () => {
    const t = setup(() => {
      throw new Error("boom");
    });
    const outcomes = await Promise.all([0, 1, 2, 3, 4].map((n) => t.maker.make(line(n), "Hello", "fr")));
    expect(outcomes).toEqual(["failed", "failed", "failed", "failed", "failed"]);
    expect(t.logged[0]).toEqual({ event: "translation_failed", fields: { room: "#bubble", error: "thrown" } });
    expect(t.logged).toHaveLength(5);
  });
});
