import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db.ts";
import { jarvisMigrations } from "./migrations.ts";

// Append-only, as the server's (server/src/migrations.test.ts): one SHA-256 for each of jarvis's migrations, in the
// order they ran on its file. A new one appends its hash here last.
const PINNED: readonly string[] = ["7c11cf655762d878fd2f5727aff275c5c0de011d18c1fdd9eebd7a2f42d53730"];

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("jarvis's migrations", () => {
  it("are the ones pinned, each unchanged and in its place, with none added unpinned", () => {
    expect(jarvisMigrations.map(sha)).toEqual(PINNED);
  });

  it("make jarvis's own file hold the budget's tables alone, each STRICT (D45)", () => {
    const db = openDatabase(":memory:", jarvisMigrations);
    try {
      const tables = db
        .prepare("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table' ORDER BY name")
        .all()
        .filter((table) => !String(table["name"]).startsWith("sqlite_"));
      expect(tables).toEqual([
        { name: "budget_days", strict: 1 },
        { name: "budget_holds", strict: 1 },
      ]);
    } finally {
      db.close();
    }
  });
});
