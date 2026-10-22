import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import { ensureRooms, ROOM_TABLES } from "../rooms/rooms.ts";
import { accountKey, VERDICT_TABLES } from "./check.ts";
import { makeStrikes } from "./strikes.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const setup = () => {
  const db = openDatabase(":memory:", [ROOM_TABLES, VERDICT_TABLES]);
  opened.push(db);
  ensureRooms(db, ["bubble", "earth"], T0);
  let n = 0;
  // A verdict as the check writes it: the account by its key, never in clear.
  const verdict = (account: string, room: string, { action, at }: { action: string; at: number }) => {
    n += 1;
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, ?, ?, ?, ?)").run(
      `m${String(n)}`,
      room,
      accountKey(PEPPER, account),
      action,
      at,
    );
  };
  return { db, verdict, strikes: makeStrikes(db, PEPPER) };
};

describe("an account's strikes", () => {
  it("count its own hidden lines in the world's rooms between two times, and nothing else", () => {
    const { verdict, strikes } = setup();
    verdict("g1a", "#bubble", { action: "hide", at: T0 });
    verdict("g1a", "#bubble", { action: "hide", at: T0 + MINUTE });
    verdict("g1a", "#bubble", { action: "pass", at: T0 + MINUTE });
    verdict("g1a", "#bubble", { action: "unchecked", at: T0 + MINUTE });
    verdict("g1a", "#earth", { action: "hide", at: T0 + MINUTE });
    verdict("g1b", "#bubble", { action: "hide", at: T0 + MINUTE });
    verdict("g1a", "#bubble", { action: "hide", at: T0 - 1 });
    const later = T0 + 10 * MINUTE;
    expect(strikes.count("g1a", "bubble", { since: T0, to: later })).toBe(2);
    expect(strikes.count("g1a", "earth", { since: T0, to: later })).toBe(1);
    expect(strikes.count("g1b", "bubble", { since: T0, to: later })).toBe(1);
    expect(strikes.count("g1a", "bubble", { since: T0 + MINUTE, to: later })).toBe(1);
    expect(strikes.count("g1c", "bubble", { since: T0, to: later })).toBe(0);
    // A hide later than the line struck is no strike of it, though its check settled first.
    expect(strikes.count("g1a", "bubble", { since: T0, to: T0 })).toBe(1);
    expect(strikes.count("g1a", "bubble", { since: T0 - 1, to: T0 + MINUTE - 1 })).toBe(2);
  });
});
