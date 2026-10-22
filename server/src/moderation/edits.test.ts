import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import { accountKey, VERDICT_TABLES } from "./check.ts";
import { editsOwn } from "./edits.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe("an edit's author", () => {
  it("owns the line it edits only when the line's verdict names the same account, and an unknown line is no one's", () => {
    const db = openDatabase(":memory:", [VERDICT_TABLES]);
    opened.push(db);
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('m1', '#bubble', ?, 'pass', 1)").run(
      accountKey(PEPPER, "g1a"),
    );
    const owns = editsOwn(db);
    expect(owns("m1", accountKey(PEPPER, "g1a"))).toBe(true);
    expect(owns("m1", accountKey(PEPPER, "g1b"))).toBe(false);
    expect(owns("m9", accountKey(PEPPER, "g1a"))).toBe(false);
  });

  it("owns its line whatever became of it: hidden, unchecked or still pending", () => {
    const db = openDatabase(":memory:", [VERDICT_TABLES]);
    opened.push(db);
    const key = accountKey(PEPPER, "g1a");
    for (const action of ["hide", "unchecked", "pending"]) {
      db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', ?, ?, 1)").run(
        action,
        key,
        action,
      );
    }
    const owns = editsOwn(db);
    expect(["hide", "unchecked", "pending"].map((id) => owns(id, key))).toEqual([true, true, true]);
  });

  it("finds no line for an id that only looks like SQL, nor one too long", () => {
    const db = openDatabase(":memory:", [VERDICT_TABLES]);
    opened.push(db);
    const key = accountKey(PEPPER, "g1a");
    db.prepare("INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('m1', '#bubble', ?, 'pass', 1)").run(
      key,
    );
    const owns = editsOwn(db);
    expect([owns("m1' OR '1'='1", key), owns(`m1${"x".repeat(7000)}`, key)]).toEqual([false, false]);
  });
});
