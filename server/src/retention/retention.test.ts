import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { GUEST_TABLES } from "../guest/guests.ts";
import { ROOM_SAID } from "../rooms/earth.ts";
import { LOGIN_TABLES, NONCE_HOST } from "../login/login.ts";
import { TICKET_TABLES } from "../login/ticket.ts";
import { PROGRESS_TABLES } from "../moderation/catchup.ts";
import { VERDICT_TABLES } from "../moderation/check.ts";
import { MUTE_TABLES } from "../moderation/mute.ts";
import { STRIKE_TABLES } from "../moderation/strikes.ts";
import { PIN_TABLES } from "../pins/pins.ts";
import { REALM_PATH, REALM_TABLES, ROOM_STATE } from "../rooms/create.ts";
import { ROOM_TABLES } from "../rooms/rooms.ts";
import { makeRetention, sizeOf, startRetention } from "./retention.ts";

const DAY = 24 * 60 * 60_000;
const T0 = Date.parse("2026-10-22T12:00:00.000Z");
const PEPPER = "a-pepper-of-forty-characters-0123456789";
// Every table main.ts opens, in its order.
const TABLES = [
  LOGIN_TABLES,
  TICKET_TABLES,
  NONCE_HOST,
  ROOM_TABLES,
  VERDICT_TABLES,
  PROGRESS_TABLES,
  MUTE_TABLES,
  STRIKE_TABLES,
  ROOM_STATE,
  REALM_TABLES,
  REALM_PATH,
  PIN_TABLES,
  GUEST_TABLES,
  ROOM_SAID,
];
const opened: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) if (db.isOpen) db.close();
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const folder = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "gnoworld-ergo-data-"));
  folders.push(dir);
  return dir;
};

interface Limits {
  maxVerdicts?: number;
  maxBytes?: number;
  batch?: number;
  batches?: number;
  ergoData?: { dir: string; maxBytes: number };
}

const setup = (limits: Limits = {}) => {
  const db = openDatabase(":memory:", TABLES);
  opened.push(db);
  const lines: string[] = [];
  const clock = { now: T0 };
  const options = { log: logger(PEPPER, (line) => lines.push(line)), now: () => clock.now, ...limits };
  const retention = makeRetention(db, options);
  const add = db.prepare(
    "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pass', ?)",
  );
  // n verdicts from `at` on, each `step` ms after the last (0: all in one millisecond).
  const verdicts = (n: number, at: number, { prefix = "m", step = 1 } = {}): void => {
    for (let i = 0; i < n; i += 1) add.run(`${prefix}${String(i)}`, at + i * step);
  };
  const Times = z.array(z.object({ at: z.number() }));
  const times = (): number[] =>
    Times.parse(db.prepare("SELECT at FROM verdicts ORDER BY at").all()).map(({ at }) => at);
  const alerts = (name: string): number => lines.filter((line) => line.includes(`"error":"${name}"`)).length;
  return { db, clock, retention, verdicts, times, alerts, lines, options };
};

describe("the pins' retention: a pin ends with Ergo's 90 days (F1482)", () => {
  it("removes a pin whose line is older than 90 days, and keeps one exactly 90 days old", () => {
    const { db, retention } = setup();
    const add = db.prepare(
      "INSERT INTO pins (room, msgid, time, account, text, pinned_by, pinned_at) VALUES ('#bubble', ?, ?, 'a', 't', 'm', ?)",
    );
    for (const [id, at] of [
      ["old", T0 - 90 * DAY - 1],
      ["edge", T0 - 90 * DAY],
      ["new", T0],
    ] as const)
      add.run(id, new Date(at).toISOString(), T0);
    retention.tick();
    const Ids = z.array(z.object({ msgid: z.string() }));
    expect(Ids.parse(db.prepare("SELECT msgid FROM pins ORDER BY msgid").all())).toEqual([
      { msgid: "edge" },
      { msgid: "new" },
    ]);
  });
});

describe("the verdicts' retention by days and by cap (3n)", () => {
  it("removes the verdicts older than 180 days, and keeps one exactly 180 days old", () => {
    const { retention, verdicts, times } = setup();
    verdicts(1, T0 - 180 * DAY - 1, { prefix: "old" });
    verdicts(1, T0 - 180 * DAY, { prefix: "edge" });
    verdicts(1, T0, { prefix: "new" });
    retention.tick();
    expect(times()).toEqual([T0 - 180 * DAY, T0]);
  });

  it("keeps the newest past its row cap, the oldest going first", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 3 });
    verdicts(5, T0 - 10);
    retention.tick();
    expect(times()).toEqual([T0 - 8, T0 - 7, T0 - 6]);
  });

  it("keeps exactly its cap when the verdicts share one millisecond", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 3 });
    verdicts(5, T0, { step: 0 });
    retention.tick();
    expect(times()).toEqual([T0, T0, T0]);
  });

  it("never removes a verdict still pending its check, past its days or the oldest past the cap (F598)", () => {
    // The cap counts every row, the pending ones too (4 checks at a time, 3i), and removes settled ones.
    const { db, retention, verdicts } = setup({ maxVerdicts: 4 });
    const pending = db.prepare(
      "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pending', ?)",
    );
    pending.run("waiting-old", T0 - 200 * DAY);
    pending.run("waiting", T0 - 100);
    verdicts(3, T0);
    retention.tick();
    const Ids = z.array(z.object({ msgid: z.string() }));
    expect(
      Ids.parse(db.prepare("SELECT msgid FROM verdicts ORDER BY at, msgid").all()).map(({ msgid }) => msgid),
    ).toEqual(["waiting-old", "waiting", "m1", "m2"]);
  });

  it("counts no pending verdict past its days, so it removes no settled one in its place (F598)", () => {
    const { db, retention, verdicts, times } = setup();
    db.prepare(
      "INSERT INTO verdicts (msgid, room, account, action, at) VALUES ('waiting', '#bubble', 'h', 'pending', ?)",
    ).run(T0 - 200 * DAY);
    verdicts(2, T0);
    retention.tick();
    expect(times()).toEqual([T0 - 200 * DAY, T0, T0 + 1]);
  });

  it("stops when only pending verdicts stand past the cap, rather than ask for ever (F598)", () => {
    const { db, retention, times } = setup({ maxVerdicts: 1 });
    const pending = db.prepare(
      "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pending', ?)",
    );
    for (const id of ["a", "b", "c"]) pending.run(id, T0);
    retention.tick();
    expect(times()).toHaveLength(3);
  });

  it("removes nothing when the clock goes back, nor a verdict dated after it", () => {
    const { clock, retention, verdicts, times } = setup();
    verdicts(1, T0 - 10 * DAY, { prefix: "past" });
    verdicts(1, T0 + DAY, { prefix: "ahead" });
    retention.tick();
    clock.now = T0 - 300 * DAY;
    retention.tick();
    expect(times()).toEqual([T0 - 10 * DAY, T0 + DAY]);
  });

  it("touches no other table: a very old row in each stays", () => {
    const { db, retention } = setup({ maxVerdicts: 1 });
    const old = T0 - 1000 * DAY;
    db.prepare("INSERT INTO accounts (address, first_seen) VALUES ('g1x', ?)").run(old);
    db.prepare("INSERT INTO nonces (nonce, chain, text, expires_at) VALUES ('n', 'c', 't', ?)").run(old);
    db.prepare("INSERT INTO tokens (hash, address, signed_at, expires_at) VALUES (x'01', 'g1x', ?, ?)").run(old, old);
    db.prepare("INSERT INTO tickets (hash, address, expires_at) VALUES (x'02', 'g1x', ?)").run(old);
    db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#old', 'old', ?)").run(old);
    db.prepare("INSERT INTO progress (room, time) VALUES ('#old', '2023-01-01T00:00:00.000Z')").run();
    db.prepare("INSERT INTO mutes (account, world, until) VALUES ('g1x', 'old', ?)").run(old);
    const Count = z.object({ n: z.number() });
    const counts = () =>
      ["accounts", "nonces", "tokens", "tickets", "rooms", "progress", "mutes"].map(
        (table) => Count.parse(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n,
      );
    retention.tick();
    expect(counts()).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("the retention's budget (3n)", () => {
  it("removes at most its budget a tick, in small batches, the rest at the next ticks", () => {
    const { retention, verdicts, times } = setup({ batch: 10, batches: 3 });
    verdicts(70, T0 - 200 * DAY);
    verdicts(2, T0, { prefix: "new" });
    const left = [];
    for (let n = 0; n < 3; n += 1) {
      retention.tick();
      left.push(times().length);
    }
    expect(left).toEqual([42, 12, 2]);
  });

  it("shares one budget between the days and the cap, the days first", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 20, batch: 10, batches: 3 });
    verdicts(20, T0 - 200 * DAY, { prefix: "old" });
    verdicts(40, T0 - 100, { prefix: "new" });
    retention.tick();
    // 30 a tick: the 20 old ones, then 10 of the 20 past the cap.
    expect(times()).toEqual(Array.from({ length: 30 }, (_, i) => T0 - 90 + i));
  });

  it("drains a backlog past the cap within one tick's budget, batch after batch (F593)", () => {
    const { retention, verdicts, times } = setup({ maxVerdicts: 3, batch: 10, batches: 3 });
    verdicts(25, T0 - 100);
    retention.tick();
    expect(times()).toEqual([T0 - 78, T0 - 77, T0 - 76]);
  });

  it("removes in statements of one batch at most, so none holds the database long (F597)", () => {
    const db = openDatabase(":memory:", TABLES);
    opened.push(db);
    const sizes: number[] = [];
    // The database as the retention sees it, each DELETE's rows counted.
    const counted = new Proxy(db, {
      get(target, key): unknown {
        if (key !== "prepare") return Reflect.get(target, key);
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.startsWith("DELETE FROM verdicts")) return statement;
          return {
            run: (...params: SQLInputValue[]) => {
              const result = statement.run(...params);
              sizes.push(Number(result.changes));
              return result;
            },
          };
        };
      },
    });
    const add = db.prepare(
      "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#bubble', 'h', 'pass', ?)",
    );
    for (let i = 0; i < 70; i += 1) add.run(`m${String(i)}`, T0 - 200 * DAY + i);
    makeRetention(counted, { log: logger(PEPPER, () => true), now: () => T0, batch: 10, batches: 3 }).tick();
    expect(sizes).toEqual([10, 10, 10]);
  });

  it("holds its default budget at one batch of 500 rows a tick, so no tick holds the event loop long", () => {
    for (const [rows, left] of [
      [500, 0],
      [501, 1],
      [1_000, 500],
    ] as const) {
      const { retention, verdicts, times } = setup();
      verdicts(rows, T0 - 200 * DAY);
      retention.tick();
      expect(times(), `${String(rows)} rows`).toHaveLength(left);
    }
  });

  it("says a backlog is left when one batch did not take it all, and drains 1,200 rows over three ticks, the oldest first", () => {
    const { retention, verdicts, times } = setup();
    verdicts(1_200, T0 - 200 * DAY);
    expect(retention.tick()).toBe(true);
    expect(times()[0]).toBe(T0 - 200 * DAY + 500);
    expect(retention.tick()).toBe(true);
    expect(retention.tick()).toBe(false);
    expect(times()).toEqual([]);
    const small = setup();
    small.verdicts(499, T0 - 200 * DAY);
    expect(small.retention.tick()).toBe(false);
  });
});

describe("the retention's alerts (3n)", () => {
  it("raises nothing on a small database at its default caps: 150,000 verdicts, 256 MB (F594)", () => {
    const { retention, verdicts, lines } = setup();
    verdicts(5, T0);
    retention.tick();
    expect(lines).toEqual([]);
  });

  it("logs each alert as the event ops reads, alert, named by its error (F595)", () => {
    const { retention, verdicts, lines } = setup({ maxVerdicts: 10 });
    verdicts(9, T0);
    retention.tick();
    expect(lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{").trim())).toEqual([
      '{"event":"alert","error":"verdicts_near_cap"}',
    ]);
  });

  it("measures after it removed: rows past their days raise nothing", () => {
    const { retention, verdicts, alerts } = setup({ maxVerdicts: 10 });
    verdicts(9, T0 - 200 * DAY);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(0);
  });

  it("raises the alert when a backlog past the cap outlasts the tick's budget", () => {
    const { retention, verdicts, alerts } = setup({ maxVerdicts: 10, batch: 5, batches: 1 });
    verdicts(30, T0);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(1);
  });

  it("raises the verdicts' alert once at 80% of their cap, again only after they fell below it", () => {
    const { db, retention, verdicts, alerts } = setup({ maxVerdicts: 10 });
    verdicts(7, T0);
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(0);
    verdicts(2, T0 + 100, { prefix: "more" });
    retention.tick();
    // Down to 8, still at 80%, and up again: no new alert.
    db.prepare("DELETE FROM verdicts WHERE msgid = 'more1'").run();
    retention.tick();
    verdicts(1, T0 + 200, { prefix: "back" });
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(1);
    // Down to 7, below, then 8: the alert again.
    db.prepare("DELETE FROM verdicts WHERE msgid IN ('more0', 'back0')").run();
    retention.tick();
    verdicts(1, T0 + 300, { prefix: "again" });
    retention.tick();
    expect(alerts("verdicts_near_cap")).toBe(2);
  });

  const usedBytes = (db: DatabaseSync): number => {
    const N = z.object({ n: z.number() });
    const pages = N.parse(
      db.prepare("SELECT page_count - freelist_count AS n FROM pragma_page_count, pragma_freelist_count").get(),
    );
    return pages.n * N.parse(db.prepare("SELECT page_size AS n FROM pragma_page_size").get()).n;
  };

  it("raises the database's alert at 80% of its size to the byte, none a byte below, again after a fall", () => {
    const { db, verdicts, options } = setup();
    const lines: string[] = [];
    const watch = (maxBytes: number) =>
      makeRetention(db, { ...options, log: logger(PEPPER, (line) => lines.push(line)), maxBytes });
    const raised = (): number => lines.filter((line) => line.includes('"error":"database_near_cap"')).length;
    verdicts(200, T0);
    // used / max = 80% exactly when used * 5 = max * 4: the largest max at 80% or above, and one past it.
    const atCap = Math.floor((usedBytes(db) * 5) / 4);
    watch(atCap + 1).tick();
    expect(raised()).toBe(0);
    const watched = watch(atCap);
    watched.tick();
    watched.tick();
    expect(raised()).toBe(1);
    db.prepare("DELETE FROM verdicts").run();
    watched.tick();
    verdicts(200, T0, { prefix: "again" });
    watched.tick();
    expect(raised()).toBe(2);
  });

  it("raises both alerts in one tick, each re-armed on its own", () => {
    const { db, verdicts, options } = setup();
    const lines: string[] = [];
    verdicts(9, T0);
    const both = makeRetention(db, {
      ...options,
      log: logger(PEPPER, (line) => lines.push(line)),
      maxVerdicts: 10,
      maxBytes: Math.floor((usedBytes(db) * 5) / 4),
    });
    both.tick();
    const names = () => lines.map((line) => /"error":"(\w+)"/.exec(line)?.[1]);
    expect(names()).toEqual(["verdicts_near_cap", "database_near_cap"]);
    db.prepare("DELETE FROM verdicts WHERE msgid IN ('m0', 'm1')").run();
    both.tick();
    verdicts(2, T0 + 100, { prefix: "back" });
    both.tick();
    expect(names()).toEqual(["verdicts_near_cap", "database_near_cap", "verdicts_near_cap"]);
  });
});

describe("Ergo's volume, measured read-only (3n-b)", () => {
  it("raises Ergo's volume alert at 80% of its cap to the byte, none a byte below, again after a fall", () => {
    const dir = folder();
    const file = join(dir, "history.db");
    writeFileSync(file, "x".repeat(800));
    const below = setup({ ergoData: { dir, maxBytes: 1001 } });
    below.retention.tick();
    expect(below.lines).toEqual([]);
    const at = setup({ ergoData: { dir, maxBytes: 1000 } });
    at.retention.tick();
    at.retention.tick();
    expect(at.lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{").trim())).toEqual([
      '{"event":"alert","error":"ergo_volume_near_cap"}',
    ]);
    truncateSync(file, 799);
    at.retention.tick();
    truncateSync(file, 800);
    at.retention.tick();
    expect(at.alerts("ergo_volume_near_cap")).toBe(2);
  });

  it("counts every file under the folder, in its sub-folders too, and no folder itself (3NB-5)", () => {
    const dir = folder();
    mkdirSync(join(dir, "history", "old"), { recursive: true });
    writeFileSync(join(dir, "ircd.db"), "x".repeat(300));
    writeFileSync(join(dir, "history", "a"), "x".repeat(200));
    writeFileSync(join(dir, "history", "old", "b"), "x".repeat(299));
    // 799 bytes of files under a cap of 1000: a folder's own size counted would pass 800.
    const { retention, alerts } = setup({ ergoData: { dir, maxBytes: 1000 } });
    retention.tick();
    expect(alerts("ergo_volume_near_cap")).toBe(0);
    writeFileSync(join(dir, "history", "old", "b"), "x".repeat(300));
    retention.tick();
    expect(alerts("ergo_volume_near_cap")).toBe(1);
  });

  it("measures the folder a link names, as the stack's mount would be", () => {
    const real = folder();
    writeFileSync(join(real, "ircd.db"), "x".repeat(800));
    const link = join(folder(), "ergo");
    symlinkSync(real, link);
    const { retention, alerts } = setup({ ergoData: { dir: link, maxBytes: 1000 } });
    retention.tick();
    expect(alerts("ergo_volume_near_cap")).toBe(1);
  });

  it("counts a link as itself, never the file or the folder it leads to", () => {
    const elsewhere = folder();
    writeFileSync(join(elsewhere, "big"), "x".repeat(100_000));
    const dir = folder();
    symlinkSync(join(elsewhere, "big"), join(dir, "file-link"));
    symlinkSync(elsewhere, join(dir, "folder-link"));
    const links = lstatSync(join(dir, "file-link")).size + lstatSync(join(dir, "folder-link")).size;
    // At 80% of a cap the links alone fill, past it with anything they lead to.
    const { retention, alerts } = setup({ ergoData: { dir, maxBytes: Math.floor((links * 5) / 4) } });
    retention.tick();
    expect(alerts("ergo_volume_near_cap")).toBe(1);
    const looser = setup({ ergoData: { dir, maxBytes: Math.floor((links * 5) / 4) + 1 } });
    looser.retention.tick();
    expect(looser.alerts("ergo_volume_near_cap")).toBe(0);
  });

  it("raises one alert while the folder cannot be read, again only after it could", () => {
    const dir = join(folder(), "ergo");
    const { retention, alerts, lines } = setup({ ergoData: { dir, maxBytes: 1000 } });
    retention.tick();
    retention.tick();
    expect(alerts("ergo_volume_unreadable")).toBe(1);
    mkdirSync(dir);
    retention.tick();
    expect(alerts("ergo_volume_unreadable")).toBe(1);
    rmSync(dir, { recursive: true });
    retention.tick();
    expect(alerts("ergo_volume_unreadable")).toBe(2);
    // An unreadable folder measures as nothing, never as full.
    expect(alerts("ergo_volume_near_cap")).toBe(0);
    expect(lines).toHaveLength(2);
  });

  it("finds a folder unreadable when it is a file, or holds a sub-folder it may not list (3NB-3)", () => {
    const parent = folder();
    writeFileSync(join(parent, "a-file"), "x".repeat(900));
    const file = setup({ ergoData: { dir: join(parent, "a-file"), maxBytes: 1000 } });
    file.retention.tick();
    expect([file.alerts("ergo_volume_unreadable"), file.alerts("ergo_volume_near_cap")]).toEqual([1, 0]);
    const dir = folder();
    mkdirSync(join(dir, "locked"));
    writeFileSync(join(dir, "locked", "big"), "x".repeat(900));
    chmodSync(join(dir, "locked"), 0o000);
    try {
      const locked = setup({ ergoData: { dir, maxBytes: 1000 } });
      locked.retention.tick();
      // A sum without the locked part would be a silent undercount.
      expect([locked.alerts("ergo_volume_unreadable"), locked.alerts("ergo_volume_near_cap")]).toEqual([1, 0]);
    } finally {
      chmodSync(join(dir, "locked"), 0o700);
    }
  });

  it("keeps the near-cap alert's state while the folder cannot be read: no second alert when it is back (3NB-3)", () => {
    const real = folder();
    writeFileSync(join(real, "ircd.db"), "x".repeat(900));
    const link = join(folder(), "ergo");
    symlinkSync(real, link);
    const { retention, alerts } = setup({ ergoData: { dir: link, maxBytes: 1000 } });
    retention.tick();
    unlinkSync(link);
    retention.tick();
    symlinkSync(real, link);
    retention.tick();
    expect([alerts("ergo_volume_near_cap"), alerts("ergo_volume_unreadable")]).toEqual([1, 1]);
  });

  it("skips a file gone between the listing and its measure, as Ergo's rewrites do (3NB-3)", () => {
    const dir = folder();
    writeFileSync(join(dir, "ircd.db"), "x".repeat(500));
    writeFileSync(join(dir, "ircd.db.tmp"), "x".repeat(400));
    const gone = (path: string) => {
      if (path.endsWith(".tmp")) throw Object.assign(new Error("gone"), { code: "ENOENT" });
      return lstatSync(path);
    };
    expect(sizeOf(dir, gone)).toBe(500);
    expect(sizeOf(dir)).toBe(900);
  });

  it("measures Ergo's folder only on a tick that left no backlog of verdicts (3NB-8)", () => {
    const dir = folder();
    writeFileSync(join(dir, "ircd.db"), "x".repeat(900));
    const { retention, verdicts, alerts } = setup({
      maxVerdicts: 100,
      batch: 5,
      batches: 1,
      ergoData: { dir, maxBytes: 1000 },
    });
    verdicts(110, T0);
    expect(retention.tick()).toBe(true);
    expect(alerts("ergo_volume_near_cap")).toBe(0);
    while (retention.tick());
    expect(alerts("ergo_volume_near_cap")).toBe(1);
  });

  it("still prunes the verdicts and measures the database when Ergo's folder cannot be read", () => {
    const { retention, verdicts, times, alerts } = setup({
      maxVerdicts: 5,
      ergoData: { dir: join(folder(), "gone"), maxBytes: 1000 },
    });
    verdicts(8, T0);
    retention.tick();
    expect(times()).toHaveLength(5);
    expect(alerts("verdicts_near_cap")).toBe(1);
  });

  it("writes nothing in Ergo's folder: its names, sizes and times stay as they were", () => {
    const dir = folder();
    mkdirSync(join(dir, "history"));
    writeFileSync(join(dir, "ircd.db"), "x".repeat(900));
    writeFileSync(join(dir, "history", "a"), "x".repeat(10));
    const seen = (): string[] =>
      readdirSync(dir, { recursive: true, encoding: "utf8" })
        .sort()
        .map((name) => {
          const { size, mtimeMs } = lstatSync(join(dir, name));
          return `${name} ${String(size)} ${String(mtimeMs)}`;
        });
    const before = [...seen(), String(lstatSync(dir).mtimeMs)];
    const { retention } = setup({ ergoData: { dir, maxBytes: 1000 } });
    retention.tick();
    retention.tick();
    expect([...seen(), String(lstatSync(dir).mtimeMs)]).toEqual(before);
  });
});

describe("the retention's runs (3n)", () => {
  it("runs at once, then every five minutes, and never after its stop", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { db, verdicts, times, options } = setup();
    verdicts(1, T0 - 200 * DAY, { prefix: "a" });
    const job = startRetention(db, options);
    expect(times()).toEqual([]);
    verdicts(1, T0 - 200 * DAY, { prefix: "b" });
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(times()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(times()).toEqual([]);
    verdicts(1, T0 - 200 * DAY, { prefix: "c" });
    job.stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(times()).toHaveLength(1);
  });

  it("goes on at once while a backlog outlasts a tick's budget, then every five minutes (F600)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { db, verdicts, times, options } = setup({ batch: 10, batches: 2 });
    verdicts(50, T0 - 200 * DAY);
    const job = startRetention(db, options);
    // A timeout of 0 set within a timer is 1 ms to the fake clock (@sinonjs/fake-timers), 0 set outside one.
    const left = [times().length];
    vi.advanceTimersByTime(0);
    left.push(times().length);
    vi.advanceTimersByTime(1);
    left.push(times().length);
    expect(left).toEqual([30, 10, 0]);
    verdicts(1, T0 - 200 * DAY, { prefix: "late" });
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(times()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(times()).toEqual([]);
    job.stop();
  });

  it("throws on a database that failed, so the process stops rather than serve unpruned", () => {
    const { db, retention } = setup();
    db.close();
    expect(() => {
      retention.tick();
    }).toThrow();
  });

  it("lets a timed run on a failed database throw too, as the first one does (F596)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { db, options } = setup();
    const job = startRetention(db, options);
    db.close();
    expect(() => {
      vi.advanceTimersByTime(5 * 60_000);
    }).toThrow();
    job.stop();
  });

  it("leaves, for any verdicts and caps, none older than its days and no more than its cap, the newest kept", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ age: fc.integer({ min: 0, max: 400 }), ms: fc.integer({ min: 0, max: 3 }) }), {
          maxLength: 60,
        }),
        fc.integer({ min: 1, max: 40 }),
        (rows, max) => {
          const { db, retention, times } = setup({ maxVerdicts: max, batch: 7, batches: 2 });
          const add = db.prepare(
            "INSERT INTO verdicts (msgid, room, account, action, at) VALUES (?, '#b', 'h', 'pass', ?)",
          );
          const ats = rows.map(({ age, ms }) => T0 - age * DAY - ms);
          ats.forEach((at, i) => add.run(`p${String(i)}`, at));
          // Enough ticks for a backlog of 60 at 14 a tick.
          for (let n = 0; n < 5; n += 1) retention.tick();
          const kept = ats.filter((at) => at >= T0 - 180 * DAY).toSorted((a, b) => a - b);
          expect(times()).toEqual(kept.slice(Math.max(0, kept.length - max)));
          db.close();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("the owned tables' retention", () => {
  it("logs an owner's expiry that throws as the retention's failure, never the search's, and goes on to the next", () => {
    const db = openDatabase(":memory:", [...TABLES]);
    const lines: string[] = [];
    const asked: number[] = [];
    makeRetention(db, {
      log: logger(PEPPER, (line) => lines.push(line)),
      now: () => T0,
      batch: 7,
      cards: {
        expire: () => {
          throw new RangeError("full");
        },
      },
      kept: {
        expire: (limit) => {
          asked.push(limit);
          return 0;
        },
      },
    }).tick();
    expect(lines.filter((line) => line.includes("cards_expire"))).toEqual([
      expect.stringContaining('"event":"retention_failed"') as unknown,
    ]);
    expect(lines.join("")).not.toContain("search_failed");
    expect(asked).toEqual([7]);
    db.close();
  });
});

describe("the translations' retention", () => {
  it("asks the translations to expire, with the budget the earlier owners leave", () => {
    const db = openDatabase(":memory:", [...TABLES]);
    const asked: number[] = [];
    const log = logger(PEPPER, () => undefined);
    makeRetention(db, {
      log,
      now: () => T0,
      batch: 7,
      translations: {
        expire: (limit) => {
          asked.push(limit);
          return 0;
        },
      },
    }).tick();
    expect(asked).toEqual([7]);
    db.close();
  });
});

describe("Jarvis's public answers' retention", () => {
  it("asks the answers to expire, with the budget the earlier owners leave", () => {
    const db = openDatabase(":memory:", [...TABLES]);
    const asked: number[] = [];
    makeRetention(db, {
      log: logger(PEPPER, () => undefined),
      now: () => T0,
      batch: 7,
      said: {
        expire: (limit) => {
          asked.push(limit);
          return 0;
        },
      },
    }).tick();
    expect(asked).toEqual([7]);
    db.close();
  });
});

describe("the unread places' retention", () => {
  it("asks the unread places to expire, with the budget the earlier owners leave", () => {
    const db = openDatabase(":memory:", [...TABLES]);
    const asked: number[] = [];
    makeRetention(db, {
      log: logger(PEPPER, () => undefined),
      now: () => T0,
      batch: 7,
      unread: {
        expire: (limit) => {
          asked.push(limit);
          return 0;
        },
      },
    }).tick();
    expect(asked).toEqual([7]);
    db.close();
  });
});
