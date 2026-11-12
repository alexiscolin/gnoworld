import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migrations } from "../migrations.ts";
import { UNREAD_TABLES } from "../unread/store.ts";
import { TranslationStore, TRANSLATION_TABLES } from "./store.ts";

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-13T12:00:00.000Z");
const open = () => {
  const db = openDatabase(":memory:", migrations);
  const clock = { now: T0 };
  return { db, clock, store: new TranslationStore(db, () => clock.now) };
};

describe("the translations' migration", () => {
  it("is in the list once, after every earlier one, strict, one row a room, line and language, and only adds", () => {
    expect(migrations.filter((sql) => sql === TRANSLATION_TABLES)).toHaveLength(1);
    expect(migrations.indexOf(TRANSLATION_TABLES)).toBeGreaterThan(migrations.indexOf(UNREAD_TABLES));
    expect(TRANSLATION_TABLES).not.toMatch(/\b(DROP|ALTER|DELETE)\b/i);
    const { db } = open();
    const sql = z
      .object({ sql: z.string() })
      .parse(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'line_translations'").get()).sql;
    expect(sql).toMatch(/\bSTRICT\b/);
    const pk = z
      .array(z.object({ name: z.string(), pk: z.number() }))
      .parse(db.prepare("SELECT name, pk FROM pragma_table_info('line_translations')").all())
      .filter(({ pk: at }) => at > 0)
      .map(({ name }) => name)
      .toSorted();
    expect(pk).toEqual(["language", "msgid", "room"]);
    db.close();
  });
});

describe("the translations' store", () => {
  it("sets a translation and an original, and reads many by room and language, in the order asked", () => {
    const { store } = open();
    store.set({ room: "#bubble", msgid: "m1", language: "fr" }, { status: "translated", text: "Bonjour", from: "en" });
    store.set({ room: "#bubble", msgid: "m2", language: "fr" }, { status: "original" });
    store.set({ room: "#bubble", msgid: "m1", language: "de" }, { status: "translated", text: "Hallo" });
    store.set({ room: "#other", msgid: "m3", language: "fr" }, { status: "translated", text: "Autre" });
    expect(store.many("#bubble", ["m2", "m1", "nope", "m3"], "fr")).toEqual([
      { msgid: "m2", status: "original" },
      { msgid: "m1", status: "translated", text: "Bonjour", from: "en" },
    ]);
    expect(store.many("#bubble", [], "fr")).toEqual([]);
  });

  it("keeps the first translation of a line and a language: a second set changes nothing", () => {
    const { store } = open();
    expect(store.set({ room: "#bubble", msgid: "m1", language: "fr" }, { status: "translated", text: "Un" })).toBe(
      true,
    );
    expect(store.set({ room: "#bubble", msgid: "m1", language: "fr" }, { status: "translated", text: "Deux" })).toBe(
      false,
    );
    expect(store.many("#bubble", ["m1"], "fr")).toEqual([{ msgid: "m1", status: "translated", text: "Un" }]);
  });

  it("drops every language of a line in its room, and no other line", () => {
    const { store } = open();
    for (const language of ["fr", "de"] as const) {
      store.set({ room: "#bubble", msgid: "m1", language: language }, { status: "original" });
      store.set({ room: "#bubble", msgid: "m2", language: language }, { status: "original" });
    }
    store.set({ room: "#other", msgid: "m1", language: "fr" }, { status: "original" });
    expect(store.drop("#bubble", "m1")).toBe(true);
    expect(store.many("#bubble", ["m1", "m2"], "fr")).toEqual([{ msgid: "m2", status: "original" }]);
    expect(store.many("#bubble", ["m1"], "de")).toEqual([]);
    expect(store.many("#other", ["m1"], "fr")).toHaveLength(1);
    expect(store.drop("#bubble", "m1")).toBe(false);
  });

  it("expires rows past 30 days, then the oldest past the row cap, at most `limit` a call, and says how many went", () => {
    const { store, clock } = open();
    store.set({ room: "#bubble", msgid: "old", language: "fr" }, { status: "original" });
    clock.now += 31 * DAY;
    for (const id of ["a", "b", "c"]) {
      clock.now += 1000;
      store.set({ room: "#bubble", msgid: id, language: "fr" }, { status: "original" });
    }
    expect(store.expire({ now: clock.now, maxRows: 2 }, 10)).toBe(2);
    expect(store.many("#bubble", ["old", "a", "b", "c"], "fr").map(({ msgid }) => msgid)).toEqual(["b", "c"]);
    expect(store.count()).toBe(2);
    clock.now += 40 * DAY;
    expect(store.expire({ now: clock.now, maxRows: 100 }, 1)).toBe(1);
    expect(store.count()).toBe(1);
  });

  it("answers a stored line's source: its text, its account, none for a line the index never held", () => {
    const { db, store } = open();
    db.prepare(
      "INSERT INTO lines (room, world, msgid, account, at, link, text) VALUES ('#bubble', 'bubble', 'm1', 'alice', 1, 0, 'Hello')",
    ).run();
    expect(store.source("#bubble", "m1")).toEqual({ account: "alice", text: "Hello" });
    expect(store.source("#bubble", "zz")).toBeUndefined();
    expect(store.source("#other", "m1")).toBeUndefined();
  });
});
