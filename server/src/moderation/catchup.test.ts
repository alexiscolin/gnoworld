import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import { makeProgress, PROGRESS_TABLES } from "./catchup.ts";

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const T = (n: number) => `2026-10-22T08:00:0${String(n)}.000Z`;
const setup = () => {
  const db = openDatabase(":memory:", [PROGRESS_TABLES]);
  opened.push(db);
  return { db, progress: makeProgress(db) };
};
const line = (msgid: string, n: number, room = "#bubble") => ({ room, msgid, time: T(n) });

describe("each room's mark", () => {
  it("is the time of the last line settled in a row, or of the first still waiting when it has none", () => {
    const { progress } = setup();
    for (const [id, n] of [
      ["m1", 1],
      ["m2", 2],
      ["m3", 3],
    ] as const)
      progress.heard(line(id, n));
    progress.settled(line("m2", 2));
    expect(progress.last("#bubble")).toBe(T(1));
    progress.settled(line("m1", 1));
    expect(progress.last("#bubble")).toBe(T(2));
    progress.settled(line("m3", 3));
    expect(progress.last("#bubble")).toBe(T(3));
  });

  it("keeps each room apart, and survives a restart", () => {
    const { db, progress } = setup();
    progress.heard(line("b1", 1));
    progress.heard(line("e1", 2, "#earth"));
    progress.settled(line("e1", 2, "#earth"));
    expect([progress.last("#bubble"), progress.last("#earth"), progress.last("#mars")]).toEqual([
      T(1),
      T(2),
      undefined,
    ]);
    progress.settled(line("b1", 1));
    expect(makeProgress(db).last("#bubble")).toBe(T(1));
  });

  it("moves nothing for a line it never heard, nor for one settled twice", () => {
    const { progress } = setup();
    progress.heard(line("m1", 1));
    progress.heard(line("m2", 2));
    progress.settled(line("m9", 9));
    progress.settled(line("m1", 1));
    progress.settled(line("m1", 1));
    expect(progress.last("#bubble")).toBe(T(1));
    progress.settled(line("m2", 2));
    progress.heard(line("m3", 3));
    progress.settled(line("m2", 2));
    expect(progress.last("#bubble")).toBe(T(2));
  });

  it("holds a line heard twice in its first place, and lets it go once settled", () => {
    const { progress } = setup();
    progress.heard(line("m1", 1));
    progress.heard(line("m2", 2));
    progress.heard(line("m1", 1));
    progress.settled(line("m2", 2));
    expect(progress.last("#bubble")).toBe(T(1));
    progress.settled(line("m1", 1));
    expect(progress.last("#bubble")).toBe(T(2));
  });

  it("keeps the last time it knows when a line settled has none", () => {
    const { progress } = setup();
    progress.heard(line("m1", 1));
    progress.heard({ room: "#bubble", msgid: "m2" });
    progress.settled(line("m1", 1));
    progress.settled({ room: "#bubble", msgid: "m2" });
    expect(progress.last("#bubble")).toBe(T(1));
  });
});

describe("each room's mark, its bound (3j's green pass)", () => {
  it("holds no line once 10,000 lines of 100 rooms are heard and settled, in their order or not", () => {
    const { progress } = setup();
    const lines = Array.from({ length: 10_000 }, (_, n) => ({
      room: `#r${String(n % 100)}`,
      msgid: `m${String(n)}`,
      time: new Date(Date.parse("2026-10-22T08:00:00.000Z") + n).toISOString(),
    }));
    for (const line of lines) progress.heard(line);
    expect(progress.size()).toEqual({ rooms: 100, lines: 10_000 });
    for (const line of lines.toReversed()) progress.settled(line);
    expect(progress.size()).toEqual({ rooms: 0, lines: 0 });
  });
});

describe("each room's mark, held during a catch-up (the max review)", () => {
  it("never passes the time a catch-up's next page starts from, and moves on once let go", () => {
    const { progress } = setup();
    progress.hold("#bubble", T(2));
    progress.heard(line("live", 8));
    progress.settled(line("live", 8));
    expect(progress.last("#bubble")).toBe(T(2));
    progress.hold("#bubble", T(5));
    expect(progress.last("#bubble")).toBe(T(5));
    progress.hold("#bubble", undefined);
    expect(progress.last("#bubble")).toBe(T(8));
  });

  it("writes the earlier of its mark and the hold, as the lines before the hold settle", () => {
    const { progress } = setup();
    progress.hold("#bubble", T(5));
    progress.heard(line("old", 3));
    progress.heard(line("live", 8));
    progress.settled(line("old", 3));
    expect(progress.last("#bubble")).toBe(T(3));
    progress.settled(line("live", 8));
    expect(progress.last("#bubble")).toBe(T(5));
    progress.hold("#bubble", T(9));
    expect(progress.last("#bubble")).toBe(T(8));
    progress.hold("#bubble", undefined);
    expect(progress.last("#bubble")).toBe(T(8));
    expect(progress.size()).toEqual({ rooms: 0, lines: 0 });
  });

  it("keeps an earlier mark under a hold, and holds no room it was not asked to", () => {
    const { progress } = setup();
    progress.heard(line("old", 1));
    progress.settled(line("old", 1));
    progress.hold("#bubble", T(4));
    expect(progress.last("#bubble")).toBe(T(1));
    progress.heard(line("e1", 9, "#earth"));
    progress.settled(line("e1", 9, "#earth"));
    expect(progress.last("#earth")).toBe(T(9));
  });

  it("never moves a mark back to a hold below it: a catch-up holds a millisecond before its mark", () => {
    const { progress } = setup();
    progress.heard(line("old", 5));
    progress.settled(line("old", 5));
    progress.hold("#bubble", T(2));
    progress.heard(line("live", 8));
    progress.settled(line("live", 8));
    expect(progress.last("#bubble")).toBe(T(5));
    progress.hold("#bubble", undefined);
    expect(progress.last("#bubble")).toBe(T(8));
  });

  it("writes nothing for a hold, nor for its end, in a room where nothing settled", () => {
    const { db, progress } = setup();
    progress.hold("#bubble", T(2));
    progress.hold("#bubble", undefined);
    progress.hold("#earth", undefined);
    expect(db.prepare("SELECT count(*) AS n FROM progress").get()).toEqual({ n: 0 });
    expect(progress.last("#bubble")).toBeUndefined();
  });
});
