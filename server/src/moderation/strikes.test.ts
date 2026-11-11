import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { ensureRooms, ROOM_TABLES } from "../rooms/rooms.ts";
import { accountKey, VERDICT_TABLES } from "./check.ts";
import type { Mutes } from "./mute.ts";
import { makeStrike, makeStrikes } from "./strikes.ts";

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
  const verdict = (
    account: string,
    room: string,
    { action, at, reason = null }: { action: string; at: number; reason?: string | null },
  ) => {
    n += 1;
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, reason, at) VALUES (?, ?, ?, ?, ?, ?)").run(
      `m${String(n)}`,
      room,
      accountKey(PEPPER, account),
      action,
      reason,
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

describe("an account's strikes, an edit it could not place (F549)", () => {
  it("count no hide of an edit of a line the bot never checked, and every other hide", () => {
    const { verdict, strikes } = setup();
    verdict("g1a", "#bubble", { action: "hide", at: T0, reason: "unknown_edit" });
    verdict("g1a", "#bubble", { action: "hide", at: T0, reason: "not_their_edit" });
    verdict("g1a", "#bubble", { action: "hide", at: T0, reason: "banned_word" });
    expect(strikes.count("g1a", "bubble", { since: T0, to: T0 })).toBe(2);
  });
});

describe("an account's mute, its hides settled out of order (the max review)", () => {
  const orders = (xs: readonly number[]): number[][] =>
    xs.length <= 1
      ? [[...xs]]
      : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
  // Each hide's verdict written as its check settles, then the strike counted; long after, as a slow check.
  const settle = (offsets: readonly number[]): string[] => {
    const { db, verdict } = setup();
    const muted: string[] = [];
    const mutes: Mutes = {
      muteKeeping: () => "muted",
      mute: (account, world) => {
        muted.push(`${account} ${world}`);
        return true;
      },
      tick: () => undefined,
      reapply: () => undefined,
      putOn: () => undefined,
    };
    const strike = makeStrike(db, {
      pepper: PEPPER,
      now: () => T0 + 60 * MINUTE,
      mute: { strikes: 3, windowMinutes: 10 },
      mutes,
      spared: () => false,
    });
    for (const n of offsets) {
      verdict("g1a", "#bubble", { action: "hide", at: T0 + n });
      strike({
        room: "#bubble",
        account: "g1a",
        msgid: `m${String(n)}`,
        text: "x",
        time: new Date(T0 + n).toISOString(),
      });
    }
    return muted;
  };

  it("mutes once three hides fall in one window, whatever order their checks settle in, and never when none holds three", () => {
    for (const order of orders([0, 5, 10].map((n) => n * MINUTE)))
      expect(settle(order), `settled ${order.join(", ")}`).toEqual(["g1a bubble"]);
    for (const spread of [
      [0, 15, 30],
      [0, 9, 18],
      [0, 10, 11],
    ])
      for (const order of orders(spread.map((n) => n * MINUTE)))
        expect(settle(order), `settled ${order.join(", ")}`).toEqual([]);
  });

  it("mutes at the window's edge to the millisecond, and a millisecond past it never", () => {
    for (const order of orders([0, 5 * MINUTE, 10 * MINUTE + 1]))
      expect(settle(order), `settled ${order.join(", ")}`).toEqual([]);
    for (const order of orders([0, 5 * MINUTE, 10 * MINUTE]))
      expect(settle(order), `settled ${order.join(", ")}`).toEqual(["g1a bubble"]);
  });

  it("mutes once for an earlier cluster, and again for a later hide alone never", () => {
    for (const order of orders([0, 5 * MINUTE, 10 * MINUTE, 40 * MINUTE]))
      expect(settle(order), `settled ${order.join(", ")}`).toEqual(["g1a bubble"]);
  });
});
