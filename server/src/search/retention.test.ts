import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Said } from "../irc/link.ts";
import { migrations } from "../migrations.ts";
import { makeRetention } from "../retention/retention.ts";
import { makeSearch } from "./index.ts";
import { expireIndex } from "./retention.ts";

// Slice 13, B1: the retention's tick takes the index's lines past 90 days and past its row cap, a batch at a time.
const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-11-11T12:00:00.000Z");
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
});

const said = (msgid: string, at: number): Said => ({
  room: "#bubble",
  account: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  msgid,
  text: `text of ${msgid}`,
  time: new Date(at).toISOString(),
});

const setup = ({ maxRows, batch = 500, batches = 1 }: { maxRows?: number; batch?: number; batches?: number } = {}) => {
  const db = openDatabase(":memory:", migrations);
  opened.push(db);
  const search = makeSearch(db, {
    roles: { worlds: new Map() },
    now: () => T0,
    ...(maxRows === undefined ? {} : { maxRows }),
  });
  const retention = makeRetention(db, {
    log: logger(PEPPER, () => undefined),
    now: () => T0,
    batch,
    batches,
    search,
  });
  return { search, retention };
};

describe("the retention's tick and the search index", () => {
  it("drops the lines past 90 days one small batch a tick (250 at most), tells there is a backlog until none is left", () => {
    const { search, retention } = setup();
    for (let i = 0; i < 400; i += 1) search.add(said(`o${String(i)}`, T0 - 91 * DAY + i));
    search.add(said("new", T0));
    const sizes = [retention.tick(), search.size(), retention.tick(), search.size()];
    expect(sizes).toEqual([true, 151, false, 1]);
  });

  it("takes no more than the batch when the batch is smaller, whatever the batches a tick", () => {
    const { search, retention } = setup({ batch: 100, batches: 3 });
    for (let i = 0; i < 1000; i += 1) search.add(said(`o${String(i)}`, T0 - 91 * DAY + i));
    retention.tick();
    expect(search.size()).toBe(900);
  });

  it("asks the index for no more than a batch at once", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const expire = vi.fn((limit: number) => limit);
    const retention = makeRetention(db, {
      log: logger(PEPPER, () => undefined),
      now: () => T0,
      batch: 50,
      batches: 2,
      search: { expire },
    });
    retention.tick();
    expect(expire.mock.calls.length).toBeGreaterThan(0);
    expect(expire.mock.calls.every(([limit]) => limit <= 50)).toBe(true);
    expect(expire.mock.calls.reduce((sum, [limit]) => sum + limit, 0)).toBeLessThanOrEqual(50);
  });

  it("drops the oldest lines past the row cap at the tick, within the batch", () => {
    const { search, retention } = setup({ maxRows: 10, batch: 4 });
    for (let i = 0; i < 20; i += 1) search.add(said(`m${String(i)}`, T0 - i * 1000));
    retention.tick();
    expect(search.size()).toBe(16);
    retention.tick();
    retention.tick();
    expect(search.size()).toBe(10);
  });

  it("leaves a database with no index in the retention untouched: the tick takes none without it", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    const retention = makeRetention(db, { log: logger(PEPPER, () => undefined), now: () => T0 });
    expect(retention.tick()).toBe(false);
  });
});

describe("an index that fails never stops the retention (F13704)", () => {
  it("logs the failing expire, still prunes the verdicts, and does not throw", () => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    db.exec(
      `INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('old', '#bubble', 'h', 'pass', ${String(T0 - 181 * DAY)})`,
    );
    const lines: string[] = [];
    const search = {
      expire: (): number => {
        throw new Error("corrupt");
      },
    };
    const retention = makeRetention(db, { log: logger(PEPPER, (line) => lines.push(line)), now: () => T0, search });
    expect(() => retention.tick()).not.toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM verdicts").get()).toEqual({ n: 0 });
    expect(lines.some((line) => line.includes('"event":"search_failed"') && line.includes("expire"))).toBe(true);
  });
});

describe("a removed text leaves the write-ahead log at the tick (F13705)", () => {
  it("is in the database file until the tick, and in no file after it", () => {
    const dir = mkdtempSync(join(tmpdir(), "gnoworld-search-"));
    const file = join(dir, "server.db");
    const db = openDatabase(file, migrations);
    opened.push(db);
    const search = makeSearch(db, { roles: { worlds: new Map() }, now: () => T0 });
    for (let i = 0; i < 300; i += 1) search.add(said(`f${String(i)}`, T0));
    search.add({ ...said("secret", T0), text: "zxqvmarker unique words" });
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    search.remove("#bubble", "secret");
    const onDisk = (): boolean =>
      [file, `${file}-wal`].some(
        (path) => existsSync(path) && readFileSync(path).toString("latin1").includes("zxqvmarker"),
      );
    const before = onDisk();
    makeRetention(db, { log: logger(PEPPER, () => undefined), now: () => T0, search }).tick();
    const after = onDisk();
    rmSync(dir, { recursive: true, force: true });
    expect([before, after]).toEqual([true, false]);
  });
});

// The surviving mutants of the day (slice 13): the budget a tick has left after the index's batch.
describe("expireIndex's budget", () => {
  const own = (expire: (limit: number) => number) => {
    const db = openDatabase(":memory:", migrations);
    opened.push(db);
    return { db, log: logger(PEPPER, () => undefined), search: { expire }, batch: 500 };
  };

  it("asks nothing of the index when the budget is spent", () => {
    const expire = vi.fn((limit: number) => limit);
    expect(expireIndex(own(expire), 0)).toBe(0);
    expect(expire).not.toHaveBeenCalled();
  });

  it("gives back the budget less what the index took, and none when it took all it was asked", () => {
    expect(
      expireIndex(
        own(() => 10),
        100,
      ),
    ).toBe(90);
    expect(
      expireIndex(
        own((limit) => limit),
        100,
      ),
    ).toBe(0);
  });
});
