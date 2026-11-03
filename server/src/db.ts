// The server's SQLite file (ADR-0002 §7): one connection, held alone for the process's life, so a
// second process on the same file fails to open it; WAL; STRICT tables; migrations applied at start,
// once each, written expand then contract so the previous image still runs on a newer file.
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const Version = z.object({ user_version: z.number().int() });
const Names = z.array(z.object({ name: z.string() }));

export function openDatabase(path: string, migrations: readonly string[]): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: 0 });
  try {
    db.exec(
      "PRAGMA locking_mode = EXCLUSIVE; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
    );
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// One transaction, the write lock taken as it begins: committed if `work` returns, rolled back if it throws.
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const done = work();
    db.exec("COMMIT");
    return done;
  } catch (error) {
    // A statement that ended the transaction itself leaves none: its own error is the one to see.
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: DatabaseSync, migrations: readonly string[]): void {
  // The write lock taken here is kept, in EXCLUSIVE mode, until the connection closes.
  transaction(db, () => {
    const { user_version: done } = Version.parse(db.prepare("PRAGMA user_version").get());
    for (const migration of migrations.slice(done)) db.exec(migration);
    const loose = Names.parse(
      db
        .prepare(
          "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND strict = 0 AND substr(name, 1, 7) <> 'sqlite_'",
        )
        .all(),
    );
    if (loose.length > 0) throw new Error(`every table is STRICT, not ${loose.map(({ name }) => name).join(", ")}`);
    if (migrations.length > done) db.exec(`PRAGMA user_version = ${String(migrations.length)}`);
  });
}
