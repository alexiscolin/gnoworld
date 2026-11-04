// The door's quota (D43, D47, D95): questions per account and UTC day, 20 by default and 5 for an account with no mainnet
// name, an allowlist of accounts counted but never refused (the day's budget still stops them), all kept in the server's
// database. The environment gives their first value at the first start alone; an admin changes them at once, read again at
// each question. One statement counts a question and refuses it together, so questions at once never pass the quota.
import type { DatabaseSync } from "node:sqlite";
import { Address, DOOR_CAPS, type JarvisChange } from "@gnoworld/schemas";
import { z } from "zod";
import { transaction } from "@gnoworld/service/db";

export const QUOTA_TABLES = `
CREATE TABLE jarvis_settings (name TEXT PRIMARY KEY CHECK (name IN ('quota', 'quota_unnamed')), value INTEGER NOT NULL) STRICT;
CREATE TABLE jarvis_unlimited (address TEXT PRIMARY KEY, added_at INTEGER NOT NULL) STRICT;
CREATE TABLE jarvis_asked (account TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (account, day)) STRICT;
CREATE INDEX jarvis_asked_by_day ON jarvis_asked (day);
`;

export interface QuotaValues {
  quota: number;
  quotaUnnamed: number;
  unlimited: Address[];
}

export interface Quota {
  // Counts a question of the account's quota, by its kind, on the day of `at` (now by default); false, counting nothing,
  // once that quota is reached.
  take: (account: Address, named: boolean, at?: number) => boolean;
  // A question given back to the day of `at`, the time it was taken (now by default): a digest jarvis made nothing for
  // costs none (10k-1).
  giveBack: (account: Address, at?: number) => void;
  values: () => QuotaValues;
  // A quota, or an account's own taken off or given back; full past the allowlist's cap.
  change: (change: Exclude<JarvisChange, { setting: "budget" }>) => "changed" | "full";
}

/** What a route that counts questions is given: the quota, and whether an account has a mainnet name, false whenever
 * that could not be read (names.ts). */
export interface Counted<K extends keyof Quota> {
  quota: Pick<Quota, K>;
  named: (account: Address) => Promise<boolean>;
}

// A time's day in UTC, as its date: toISOString writes UTC whatever the machine's zone.
const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

export function makeQuota(db: DatabaseSync, { first, now }: { first: QuotaValues; now: () => number }): Quota {
  const Rows = z.array(z.object({ name: z.string(), value: z.number() }));
  const Values = z.object({ quota: z.number(), quota_unnamed: z.number() });
  const Listed = z.array(z.object({ address: Address }));
  const sql = {
    seed: db.prepare("INSERT INTO jarvis_settings (name, value) VALUES (?, ?) ON CONFLICT DO NOTHING"),
    settings: db.prepare("SELECT name, value FROM jarvis_settings"),
    set: db.prepare("UPDATE jarvis_settings SET value = ? WHERE name = ?"),
    unlimited: db.prepare("SELECT address FROM jarvis_unlimited ORDER BY address"),
    // Past the cap, nothing is added: the one statement reads the count and writes.
    allow: db.prepare(`INSERT INTO jarvis_unlimited (address, added_at) SELECT :address, :at
      WHERE (SELECT count(*) FROM jarvis_unlimited) < :cap OR EXISTS (SELECT 1 FROM jarvis_unlimited WHERE address = :address)
      ON CONFLICT (address) DO UPDATE SET added_at = added_at RETURNING 1`),
    limit: db.prepare("DELETE FROM jarvis_unlimited WHERE address = ?"),
    // The quota of the account's kind and the allowlist read, the count added to and refused, in one statement.
    take: db.prepare(`INSERT INTO jarvis_asked (account, day, count) VALUES (:account, :day, 1)
      ON CONFLICT (account, day) DO UPDATE SET count = count + 1
      WHERE EXISTS (SELECT 1 FROM jarvis_unlimited WHERE address = :account)
        OR count < (SELECT value FROM jarvis_settings WHERE name = :kind)
      RETURNING count`),
    giveBack: db.prepare("UPDATE jarvis_asked SET count = count - 1 WHERE account = ? AND day = ? AND count > 0"),
    // At most 500 past rows a question, by the day's index: a day's turn never holds the event loop.
    purge: db.prepare(
      "DELETE FROM jarvis_asked WHERE rowid IN (SELECT rowid FROM jarvis_asked WHERE day < ? LIMIT 500)",
    ),
  };
  // The environment's values at the first start alone: the allowlist with the quotas, in one transaction.
  transaction(db, () => {
    const seeded = Number(sql.seed.run("quota", first.quota).changes);
    sql.seed.run("quota_unnamed", first.quotaUnnamed);
    if (seeded === 1)
      for (const address of first.unlimited) sql.allow.run({ address, at: now(), cap: DOOR_CAPS.unlimited });
  });
  return {
    take(account, named, at = now()) {
      const day = dayOf(at);
      sql.purge.run(day);
      return sql.take.get({ account, day, kind: named ? "quota" : "quota_unnamed" }) !== undefined;
    },
    giveBack(account, at = now()) {
      sql.giveBack.run(account, dayOf(at));
    },
    values() {
      const rows = Rows.parse(sql.settings.all());
      const { quota, quota_unnamed: quotaUnnamed } = Values.parse(
        Object.fromEntries(rows.map(({ name, value }) => [name, value])),
      );
      return { quota, quotaUnnamed, unlimited: Listed.parse(sql.unlimited.all()).map(({ address }) => address) };
    },
    change(change) {
      if (change.setting !== "unlimited") sql.set.run(change.questions, change.setting);
      else if (!change.unlimited) sql.limit.run(change.account);
      else if (sql.allow.get({ address: change.account, at: now(), cap: DOOR_CAPS.unlimited }) === undefined) {
        return "full";
      }
      return "changed";
    },
  };
}
