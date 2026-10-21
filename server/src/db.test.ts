import { mkdtempSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.ts";

const fresh = (): string => join(mkdtempSync(join(tmpdir(), "gnoworld-db-")), "server.db");
const one = (db: DatabaseSync, sql: string): unknown => db.prepare(sql).get();
const tables = (db: DatabaseSync): unknown =>
  db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
const NOTE = "CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT NOT NULL) STRICT";
const TAG = "CREATE TABLE tag (note INTEGER NOT NULL REFERENCES note (id), name TEXT NOT NULL) STRICT";

describe("openDatabase", () => {
  it("opens in WAL mode, foreign keys on", () => {
    const db = openDatabase(fresh(), []);
    expect(one(db, "PRAGMA journal_mode")).toEqual({ journal_mode: "wal" });
    expect(one(db, "PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it("applies each migration once: a second start changes nothing", () => {
    const path = fresh();
    let db = openDatabase(path, [NOTE]);
    db.exec("INSERT INTO note (body) VALUES ('kept')");
    db.close();
    db = openDatabase(path, [NOTE]);
    expect(one(db, "SELECT count(*) AS n FROM note")).toEqual({ n: 1 });
    expect(one(db, "PRAGMA user_version")).toEqual({ user_version: 1 });
    db.close();
  });

  it("applies only the migrations added since the last start, in order", () => {
    const path = fresh();
    openDatabase(path, [NOTE]).close();
    const db = openDatabase(path, [NOTE, TAG]);
    expect(tables(db)).toEqual([{ name: "note" }, { name: "tag" }]);
    expect(one(db, "PRAGMA user_version")).toEqual({ user_version: 2 });
    db.close();
  });

  it("opens a file a newer version migrated, unchanged: the previous image still runs after a rollback", () => {
    const path = fresh();
    openDatabase(path, [NOTE, TAG]).close();
    const db = openDatabase(path, [NOTE]);
    expect(tables(db)).toEqual([{ name: "note" }, { name: "tag" }]);
    expect(one(db, "PRAGMA user_version")).toEqual({ user_version: 2 });
    db.close();
  });

  it.each([
    ["a table without STRICT", "CREATE TABLE loose (id INTEGER)", /STRICT/],
    ["a table made from a query, never STRICT", "CREATE TABLE copied AS SELECT 1 AS id", /STRICT/],
    ["a migration that fails", "CREATE TABLE half (id INTEGER) STRICT; CREATE TABLE broken (", /incomplete input/],
  ])("refuses %s, and leaves the file as it was", (_, migration, error) => {
    const path = fresh();
    openDatabase(path, [NOTE]).close();
    expect(() => openDatabase(path, [NOTE, migration])).toThrow(error);
    const db = openDatabase(path, [NOTE]);
    expect(tables(db)).toEqual([{ name: "note" }]);
    expect(one(db, "PRAGMA user_version")).toEqual({ user_version: 1 });
    db.close();
  });

  it("holds the file alone: a second opening is refused until the first closes", () => {
    const path = fresh();
    const first = openDatabase(path, []);
    expect(() => openDatabase(path, [])).toThrow(/database is locked/);
    // The refused opening kept nothing: once the first closes, the file opens again.
    first.close();
    openDatabase(path, []).close();
  });
});
