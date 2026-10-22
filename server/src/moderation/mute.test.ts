import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import { makeMutes, MUTE_TABLES } from "./mute.ts";

const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const MINUTE = 60_000;
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const ROOMS: Record<string, string[]> = { bubble: ["#bubble", "#bubble-ops"], earth: ["#earth"] };

const setup = (options: { max?: number; db?: DatabaseSync } = {}) => {
  const db = options.db ?? openDatabase(":memory:", [MUTE_TABLES]);
  if (options.db === undefined) opened.push(db);
  const clock = { now: T0 };
  const link = { up: true };
  const sent: string[] = [];
  const mutes = makeMutes({
    db,
    send: (command, params) => {
      if (!link.up) return false;
      sent.push([command, ...params].join(" "));
      return true;
    },
    roomsOf: (world) => ROOMS[world] ?? [],
    now: () => clock.now,
    forMs: 5 * MINUTE,
    max: options.max ?? 50,
  });
  return { db, clock, link, sent, mutes };
};

describe("the mute", () => {
  it("mutes an account in every room of its world with Ergo's m: extban, once while it lasts", () => {
    const { sent, mutes } = setup();
    expect(mutes.mute("g1a", "bubble")).toBe(true);
    expect(mutes.mute("g1a", "bubble")).toBe(false);
    expect(sent).toEqual(["SAMODE #bubble +b m:g1a", "SAMODE #bubble-ops +b m:g1a"]);
  });

  it("mutes each world apart", () => {
    const { sent, mutes } = setup();
    expect([mutes.mute("g1a", "bubble"), mutes.mute("g1a", "earth")]).toEqual([true, true]);
    expect(sent).toContain("SAMODE #earth +b m:g1a");
  });

  it("lifts it at its time, not a millisecond before, and may mute again after", () => {
    const { clock, sent, mutes } = setup();
    mutes.mute("g1a", "bubble");
    clock.now = T0 + 5 * MINUTE - 1;
    mutes.tick();
    expect(sent).toHaveLength(2);
    clock.now = T0 + 5 * MINUTE;
    mutes.tick();
    expect(sent.slice(2)).toEqual(["SAMODE #bubble -b m:g1a", "SAMODE #bubble-ops -b m:g1a"]);
    mutes.tick();
    expect(sent).toHaveLength(4);
    expect(mutes.mute("g1a", "bubble")).toBe(true);
  });

  it("keeps a lift the link could not send, and sends it at a later tick", () => {
    const { clock, link, sent, mutes } = setup();
    mutes.mute("g1a", "bubble");
    clock.now = T0 + 5 * MINUTE;
    link.up = false;
    mutes.tick();
    link.up = true;
    mutes.tick();
    expect(sent.slice(2)).toEqual(["SAMODE #bubble -b m:g1a", "SAMODE #bubble-ops -b m:g1a"]);
  });

  it("holds a mute the link could not send, and puts it on when the link is back", () => {
    const { link, sent, mutes } = setup();
    link.up = false;
    expect(mutes.mute("g1a", "bubble")).toBe(true);
    link.up = true;
    mutes.reapply();
    expect(sent).toEqual(["SAMODE #bubble +b m:g1a", "SAMODE #bubble-ops +b m:g1a"]);
  });

  it("holds at most its cap in a world, lifting first the mute that ends first", () => {
    const { clock, sent, mutes } = setup({ max: 2 });
    mutes.mute("g1a", "earth");
    clock.now = T0 + MINUTE;
    mutes.mute("g1b", "earth");
    clock.now = T0 + 2 * MINUTE;
    mutes.mute("g1c", "earth");
    expect(sent.slice(2)).toEqual(["SAMODE #earth -b m:g1a", "SAMODE #earth +b m:g1c"]);
    expect(mutes.mute("g1b", "earth")).toBe(false);
    expect(mutes.mute("g1a", "bubble")).toBe(true);
  });

  it("keeps the lift of a mute pushed out by the cap while the link is down, and holds the new one", () => {
    const { clock, link, sent, mutes } = setup({ max: 1 });
    mutes.mute("g1a", "earth");
    clock.now = T0 + MINUTE;
    link.up = false;
    expect(mutes.mute("g1b", "earth")).toBe(true);
    link.up = true;
    mutes.tick();
    expect(sent.slice(1)).toEqual(["SAMODE #earth -b m:g1a"]);
    mutes.reapply();
    expect(sent.slice(2)).toEqual(["SAMODE #earth +b m:g1b"]);
    expect(mutes.mute("g1b", "earth")).toBe(false);
  });

  it("puts a mute back at its last millisecond, and lifts it at its end, when the link returns", () => {
    const { clock, sent, mutes } = setup();
    mutes.mute("g1a", "earth");
    clock.now = T0 + 5 * MINUTE - 1;
    mutes.reapply();
    expect(sent.slice(1)).toEqual(["SAMODE #earth +b m:g1a"]);
    clock.now = T0 + 5 * MINUTE;
    mutes.reapply();
    expect(sent.slice(2)).toEqual(["SAMODE #earth -b m:g1a"]);
  });

  it("comes back after a restart: the live mutes put back, the ended ones lifted", () => {
    const first = setup();
    first.mutes.mute("g1a", "earth");
    first.clock.now = T0 + 4 * MINUTE;
    first.mutes.mute("g1b", "earth");
    const again = setup({ db: first.db });
    again.clock.now = T0 + 6 * MINUTE;
    again.mutes.reapply();
    expect(again.sent.toSorted()).toEqual(["SAMODE #earth +b m:g1b", "SAMODE #earth -b m:g1a"].toSorted());
    expect(again.mutes.mute("g1b", "earth")).toBe(false);
  });
});
