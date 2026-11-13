import { createHash } from "node:crypto";
import { openDatabase } from "@gnoworld/service/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migrations } from "../migrations.ts";
import { SEARCH_TABLES } from "../search/index.ts";
import { CARD_TABLES } from "./store.ts";

// L3 (docs/plans/link-previews.md §7 "migrations.ts": the tables, expand only): the cards' migration is appended after search's, never inserted,
// and migrations.test.ts pins its SHA-256 (the builder appends it to PINNED, which this test cannot hold before the SQL exists).
const Column = z.object({ name: z.string(), type: z.string(), notnull: z.number(), pk: z.number() });
const columns = (db: ReturnType<typeof openDatabase>, table: string) =>
  z.array(Column).parse(db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info('${table}')`).all());

describe("the cards' migration", () => {
  it("is in the list, once, after the search index's, so no applied migration moves", () => {
    expect(CARD_TABLES).not.toBe("");
    expect(migrations.filter((sql) => sql === CARD_TABLES)).toHaveLength(1);
    expect(migrations.indexOf(CARD_TABLES)).toBeGreaterThan(migrations.indexOf(SEARCH_TABLES));
    expect(createHash("sha256").update(CARD_TABLES).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes link_cards, one row a URL key, and line_cards, one row a line, strict, with no text of any line", () => {
    const db = openDatabase(":memory:", migrations);
    try {
      const link = columns(db, "link_cards").map(({ name }) => name);
      const line = columns(db, "line_cards").map(({ name }) => name);
      expect(link).toEqual(expect.arrayContaining(["key", "at"]));
      expect(line).toEqual(expect.arrayContaining(["msgid", "room", "key", "author"]));
      expect(line).not.toContain("text");
      expect(columns(db, "link_cards").find(({ name }) => name === "key")?.pk).toBe(1);
      expect(columns(db, "line_cards").find(({ name }) => name === "msgid")?.pk).toBeGreaterThan(0);
      for (const table of ["link_cards", "line_cards"]) {
        const sql = z
          .object({ sql: z.string() })
          .parse(db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(table)).sql;
        expect(sql).toMatch(/\bSTRICT\b/);
      }
    } finally {
      db.close();
    }
  });

  it("only adds: applied after every earlier migration, it leaves their tables as they were, and holds no DROP, ALTER or DELETE", () => {
    const at = migrations.indexOf(CARD_TABLES);
    const db = openDatabase(":memory:", migrations.slice(0, at));
    const Schema = z.array(z.object({ name: z.string(), sql: z.string().nullable() }));
    const schema = () => Schema.parse(db.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all());
    const before = schema();
    db.exec(CARD_TABLES);
    expect(schema().filter(({ name }) => before.some((old) => old.name === name))).toEqual(before);
    expect(CARD_TABLES).not.toMatch(/\b(DROP|ALTER|DELETE)\b/i);
    db.close();
  });
});
