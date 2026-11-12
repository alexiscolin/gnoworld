import type { DatabaseSync } from "node:sqlite";
import { REALM_EXPLAIN_VERSION } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../migrations.ts";
import { EXPLAIN_TABLES, makeExplanations, type Key } from "./store.ts";

const T0 = Date.parse("2026-11-12T12:00:00.000Z");
const KEY: Key = { kind: "realm", chain: "onyx-1", subject: "gno.land/r/demo/defi/grc20factory" };
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});
const setup = () => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  return { db, store: makeExplanations(db) };
};
const READY = { text: "A token factory.", tags: ["token" as const], model: "claude-haiku-5-5", now: T0 };

describe("the explanations' table", () => {
  it("is the last migration, on the server's file", () => {
    expect(migrations.at(-1)).toBe(EXPLAIN_TABLES);
  });

  it("reads each of its lookups by its key, never a scan (EXPLAIN QUERY PLAN)", () => {
    const { db } = setup();
    const plan = (sql: string, ...args: (string | number)[]) =>
      db
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...args)
        .map((row) => String(row["detail"]))
        .join(" | ");
    expect(
      plan(
        "SELECT * FROM explanations WHERE kind = ? AND chain = ? AND subject = ? AND version = ?",
        "realm",
        "c",
        "s",
        1,
      ),
    ).toMatch(/SEARCH explanations USING PRIMARY KEY \(kind=\? AND chain=\? AND subject=\? AND version=\?\)/);
    expect(plan("SELECT count(*) FROM explanations WHERE started >= ?", 1)).toMatch(
      /USING (COVERING )?INDEX explanations_by_started/,
    );
    expect(
      plan(
        "DELETE FROM explanations WHERE kind = ? AND chain = ? AND subject = ? AND version < ?",
        "realm",
        "c",
        "s",
        1,
      ),
    ).toMatch(/SEARCH explanations USING PRIMARY KEY \(kind=\? AND chain=\? AND subject=\?/);
  });

  it("has no row for a subject never asked", () => {
    expect(setup().store.get(KEY)).toBeUndefined();
  });

  it("claims a subject once: a second claim while it is making loses, and a stale making is claimed again", () => {
    const { store } = setup();
    expect(store.claim(KEY, { now: T0, until: T0 + 1000 })).toBe(true);
    expect(store.get(KEY)).toMatchObject({ state: "making", tries: 1, nextTry: T0 + 1000 });
    expect(store.claim(KEY, { now: T0 + 500, until: T0 + 1500 })).toBe(false);
    expect(store.claim(KEY, { now: T0 + 1000, until: T0 + 2000 })).toBe(true);
    expect(store.get(KEY)).toMatchObject({ state: "making", tries: 2 });
  });

  it("keeps a ready row, whose text and tags read back, and never claims it again", () => {
    const { store } = setup();
    store.claim(KEY, { now: T0, until: T0 + 1000 });
    store.keep(KEY, READY);
    expect(store.get(KEY)).toEqual({
      state: "ready",
      text: "A token factory.",
      tags: ["token"],
      model: "claude-haiku-5-5",
      tries: 1,
      nextTry: 0,
    });
    expect(store.claim(KEY, { now: T0 + 9e9, until: T0 + 9e9 + 1 })).toBe(false);
  });

  it("never claims a refused row, for any time", () => {
    const { store } = setup();
    store.claim(KEY, { now: T0, until: T0 + 1000 });
    store.refuse(KEY);
    expect(store.get(KEY)).toMatchObject({ state: "refused", text: null, tags: [] });
    expect(store.claim(KEY, { now: T0 + 9e12, until: T0 + 9e12 + 1 })).toBe(false);
  });

  it("claims a failed row again only once its time to retry has come", () => {
    const { store } = setup();
    store.claim(KEY, { now: T0, until: T0 + 1000 });
    store.failedAt(KEY, T0 + 60_000);
    expect(store.get(KEY)).toMatchObject({ state: "failed", nextTry: T0 + 60_000 });
    expect(store.claim(KEY, { now: T0 + 59_999, until: T0 + 70_000 })).toBe(false);
    expect(store.claim(KEY, { now: T0 + 60_000, until: T0 + 70_000 })).toBe(true);
  });

  it("keeps a world's row and a realm's row of one subject apart", () => {
    const { store } = setup();
    store.keep(KEY, READY);
    expect(store.get({ ...KEY, kind: "world" })).toBeUndefined();
    expect(store.get({ ...KEY, chain: "gnoland-1" })).toBeUndefined();
  });

  it("counts the makings started since a time", () => {
    const { store } = setup();
    store.claim(KEY, { now: T0, until: T0 + 1 });
    store.claim({ ...KEY, subject: "gno.land/r/a/b" }, { now: T0 + 10, until: T0 + 11 });
    expect(store.startedSince(T0)).toBe(2);
    expect(store.startedSince(T0 + 1)).toBe(1);
    expect(store.startedSince(T0 + 11)).toBe(0);
  });

  it("drops an older version's row once the newer one is ready, and not before", () => {
    const { db, store } = setup();
    const old = REALM_EXPLAIN_VERSION - 1;
    db.prepare(
      "INSERT INTO explanations (kind, chain, subject, version, state, text, tags, model, made_at, tries, started, next_try) VALUES (?, ?, ?, ?, 'ready', 'Old.', '[]', 'm', 1, 1, 1, 0)",
    ).run(KEY.kind, KEY.chain, KEY.subject, old);
    store.claim(KEY, { now: T0, until: T0 + 1 });
    expect(db.prepare("SELECT count(*) AS n FROM explanations").get()).toEqual({ n: 2 });
    store.keep(KEY, READY);
    expect(db.prepare("SELECT version FROM explanations").all()).toEqual([{ version: REALM_EXPLAIN_VERSION }]);
  });

  it("is never evicted: no statement of the table deletes by age", () => {
    const { db, store } = setup();
    store.keep(KEY, READY);
    expect(db.prepare("SELECT count(*) AS n FROM explanations").get()).toEqual({ n: 1 });
    expect(Object.keys(store).sort()).toEqual(["claim", "failedAt", "get", "keep", "refuse", "seed", "startedSince"]);
  });
});

describe("the seed rows", () => {
  it("writes a ready row with the model seed, and says so", () => {
    const { store } = setup();
    expect(store.seed(KEY, { text: "A token.", tags: ["token"], now: T0 })).toBe(true);
    expect(store.get(KEY)).toMatchObject({ state: "ready", text: "A token.", model: "seed" });
  });

  it("is idempotent: the same seed twice leaves one row, and a changed seed replaces a seed row", () => {
    const { db, store } = setup();
    store.seed(KEY, { text: "A token.", tags: ["token"], now: T0 });
    store.seed(KEY, { text: "A token.", tags: ["token"], now: T0 });
    store.seed(KEY, { text: "A coin.", tags: ["token"], now: T0 + 1 });
    expect(db.prepare("SELECT count(*) AS n FROM explanations").get()).toEqual({ n: 1 });
    expect(store.get(KEY)).toMatchObject({ text: "A coin." });
  });

  it("never overwrites a ready row of Jarvis's of the same version", () => {
    const { store } = setup();
    store.keep(KEY, READY);
    expect(store.seed(KEY, { text: "Seeded.", tags: [], now: T0 + 1 })).toBe(false);
    expect(store.get(KEY)).toMatchObject({ text: "A token factory.", model: "claude-haiku-5-5" });
  });

  it("does not count against the day's makings: a seed of a thousand rows leaves the cap whole", () => {
    const { store } = setup();
    for (let n = 0; n < 1000; n += 1)
      store.seed({ ...KEY, subject: `gno.land/r/a/r${String(n)}` }, { text: "A token.", tags: [], now: T0 });
    expect(store.startedSince(T0 - 24 * 3_600_000)).toBe(0);
  });

  it("writes a seed that is no line as a refused row, so Jarvis never spends on it", () => {
    const { store } = setup();
    expect(store.seed(KEY, undefined)).toBe(true);
    expect(store.get(KEY)).toMatchObject({ state: "refused", model: "seed" });
    expect(store.claim(KEY, { now: T0 + 9e12, until: T0 + 9e12 + 1 })).toBe(false);
  });

  it("takes the place of a failed, refused or making row of Jarvis's", () => {
    const { store } = setup();
    store.claim(KEY, { now: T0, until: T0 + 1 });
    store.failedAt(KEY, T0 + 1);
    expect(store.seed(KEY, { text: "A token.", tags: [], now: T0 })).toBe(true);
    expect(store.get(KEY)).toMatchObject({ state: "ready", model: "seed" });
  });
});
