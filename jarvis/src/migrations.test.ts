import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@gnoworld/service/db";
import { jarvisMigrations } from "./migrations.ts";

// Append-only, as the server's (server/src/migrations.test.ts): one SHA-256 for each of jarvis's migrations, in the
// order they ran on its file. A new one appends its hash here last.
const PINNED: readonly string[] = [
  "7c11cf655762d878fd2f5727aff275c5c0de011d18c1fdd9eebd7a2f42d53730",
  // The budget's caps (10i): the settings seed them once, an admin changes them.
  "26dc8aa73b1af524ea23ba701b1d31a8132b8ddcd0c049a73c1f5ba876b6b955",
  // The translations' and the digests' caches (10k), each its bytes counted for its bound.
  "aba2a7d1c683d8bdd15167f039bdc77a1f41fdb0b93f978540094ee4107ef28b",
];

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("jarvis's migrations", () => {
  it("are the ones pinned, each unchanged and in its place, with none added unpinned", () => {
    expect(jarvisMigrations.map(sha)).toEqual(PINNED);
  });

  it("make jarvis's own file hold the budget's tables, its caps, and the translations' and digests' caches, each STRICT (D45)", () => {
    const db = openDatabase(":memory:", jarvisMigrations);
    try {
      const tables = db
        .prepare("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table' ORDER BY name")
        .all()
        .filter((table) => !String(table["name"]).startsWith("sqlite_"));
      expect(tables).toEqual([
        { name: "budget_caps", strict: 1 },
        { name: "budget_days", strict: 1 },
        { name: "budget_holds", strict: 1 },
        { name: "digests", strict: 1 },
        { name: "translations", strict: 1 },
      ]);
    } finally {
      db.close();
    }
  });
});
