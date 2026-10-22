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
