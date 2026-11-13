import type { DatabaseSync } from "node:sqlite";
import { Address, type JarvisAnswer } from "@gnoworld/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { ROOM_TABLES } from "../rooms/rooms.ts";
import { DAY_TABLES } from "./day.ts";
import { hereKey, KEPT_TABLES } from "./kept.ts";
import { doorMemory } from "./memory.ts";

// What the door remembers: shared by the chat that feeds it and the ask route that reads it.
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const ANNA = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
const setup = (origins: string[]) => {
  const db = openDatabase(":memory:", [ROOM_TABLES, DAY_TABLES, KEPT_TABLES]);
  opened.push(db);
  return doorMemory(db, origins, { now: () => T0 });
};

describe("the door's memory", () => {
  it("lets a link name the server's own sites and gno.land, nothing else", () => {
    const { ask } = setup(["https://gnoworld.test", "https://app.example:8443", "not an origin"]);
    expect([...ask.hosts].sort()).toEqual(["app.example", "gno.land", "gnoworld.test"]);
  });

  it("drops the room's served answers when the chat tells a line was taken, and no other room's", () => {
    const { ask, chat } = setup([]);
    const answer: JarvisAnswer = { status: "answered", markdown: "x", buttons: [] };
    ask.served.set("a", answer, { room: "#a", started: T0 - 1 });
    ask.served.set("b", answer, { room: "#b", started: T0 - 1 });
    chat.changed("#a");
    expect([ask.served.get("a"), ask.served.get("b")]).toEqual([undefined, answer]);
  });

  it("has the accounts the chat heard speak, and no others", () => {
    const { ask, chat } = setup([]);
    expect(ask.heard(ANNA)).toBe(false);
    chat.heard.said(ANNA);
    expect(ask.heard(ANNA)).toBe(true);
  });

  it("drops the room's kept answers in the database too when the chat tells a line was taken, and no other room's", () => {
    const { ask, chat } = setup([]);
    const answer: JarvisAnswer = { status: "answered", markdown: "x", buttons: [] };
    ask.kept.set(hereKey("#a"), answer, { room: "#a", started: T0 - 1 });
    ask.kept.set(hereKey("#b"), answer, { room: "#b", started: T0 - 1 });
    chat.changed("#a");
    expect([ask.kept.get(hereKey("#a")), ask.kept.get(hereKey("#b"))]).toEqual([undefined, answer]);
  });

  it("gives the ask route and the retention the one kept store, whose expire the retention calls", () => {
    expect(setup([]).ask.kept.expire(1)).toBe(0);
  });
});
