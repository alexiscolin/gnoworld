import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import type { Link, Said } from "../irc/link.ts";
import { PIN_TABLES } from "./pins.ts";
import { pinsFor } from "./wire.ts";

// What the link tells the pins' part of the chat: a line that replaces another, its author's edit (R12 of redpass2-4dx),
// as the chat hands it on, without the real link or Ergo.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const MOD = "g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw";
const ROOM = "#bubble/games";

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const said = (msgid: string, over: Partial<Said> = {}): Said => ({
  room: ROOM,
  account: ALICE,
  msgid,
  text: `text of ${msgid}`,
  time: "2026-10-25T10:00:00.000Z",
  ...over,
});

function setup() {
  const db = openDatabase(":memory:", [PIN_TABLES]);
  opened.push(db);
  const held = new Map([said("m1"), said("m2", { edits: "m1" }), said("m3", { edits: "m1" })].map((s) => [s.msgid, s]));
  const link: Link = {
    send: () => false,
    state: () => Promise.resolve(undefined),
    line: (_, msgid) => Promise.resolve(held.get(msgid) ?? "gone"),
    relay: () => Promise.resolve(false),
    relaying: () => 0,
    stop: () => Promise.resolve(),
  };
  const { api, onEdit } = pinsFor(db, { worlds: new Map() }, { link: () => link, now: () => 0, log: () => undefined });
  const ids = () => api.pins.list(ROOM).map(({ id }) => id);
  return { api, onEdit, ids };
}

describe("the pins and an edit the link heard", () => {
  it("drops the pin of the line its author's edit replaced, and pins it no more", async () => {
    const { api, onEdit, ids } = setup();
    expect(await api.pins.add(ROOM, "m1", MOD)).toBe("pinned");
    onEdit(said("m2", { edits: "m1" }));
    expect(ids()).toEqual([]);
    expect(await api.pins.add(ROOM, "m1", MOD)).toBe("not_found");
  });

  it("drops the pin of the correcting line the author's next edit replaced, which needs the edit's own id", async () => {
    const { api, onEdit, ids } = setup();
    onEdit(said("m2", { edits: "m1" }));
    expect(await api.pins.add(ROOM, "m2", MOD)).toBe("pinned");
    onEdit(said("m3", { edits: "m1" }));
    expect(ids()).toEqual([]);
  });

  it("changes nothing for another account's edit, nor for a line that edits none", async () => {
    const { api, onEdit, ids } = setup();
    await api.pins.add(ROOM, "m1", MOD);
    onEdit(said("m2", { edits: "m1", account: BOB }));
    onEdit(said("m4"));
    expect(ids()).toEqual(["m1"]);
  });
});

// The maker of a room anyone made on the Earth pins it by the owner's right (roles/mayModerate.ts), never as staff.
describe("the staff of a room", () => {
  it("is the room's world's moderators and the team, never the maker of a room anyone made", () => {
    const db = openDatabase(":memory:", [PIN_TABLES]);
    opened.push(db);
    const roles = { worlds: new Map([["earth", { rules: {} as never, moderators: new Set([MOD]) }]]) };
    const { api } = pinsFor(db, roles, { link: () => undefined, now: () => 0, log: () => undefined });
    expect([
      api.staff("#earth/cafe", ALICE),
      api.staff("#earth/cafe", BOB),
      api.staff("#earth/cafe", MOD),
      api.staff("#earth/other", MOD),
    ]).toEqual([false, false, true, true]);
  });
});
