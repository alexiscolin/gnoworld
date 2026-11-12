// The token worlds' state (slice 13) in the server's database, for one universe: per token its supply, holders' balances and transfers a day,
// replayed from grc20's own events, and the height every event is replayed up to, so a pass reads only what is new and a restart resumes.
// A balance below zero, a name announced twice, a transfer to oneself or more rows than the cap mark a token `ambiguous`: its balances are
// dropped and it shows no holders. Amounts are BigInt in the replay and decimal text in the table (an int64 passes a JS number).
import { TOKEN_CAPS, type TokenAnswer } from "@gnoworld/schemas/indexer";
import { transaction } from "@gnoworld/service/db";
import type { DatabaseSync } from "node:sqlite";
import type { Dated } from "./blockDays.ts";
import { answerFor, heldBy, type HeldToken } from "./tokenAnswer.ts";
import { remember } from "../remember.ts";
import { anchorIn, heightIn } from "./stateRows.ts";
import { fold, statements } from "./tokenReplay.ts";

export const TOKEN_TABLES = `
CREATE TABLE grc20_state (universe TEXT PRIMARY KEY, height INTEGER NOT NULL, anchor INTEGER, anchor_time TEXT) STRICT;
CREATE TABLE grc20_tokens (token TEXT PRIMARY KEY, realm_hash TEXT NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL, decimals INTEGER NOT NULL, supply TEXT NOT NULL, holders INTEGER NOT NULL, ambiguous INTEGER NOT NULL, last_height INTEGER, last_day TEXT) STRICT, WITHOUT ROWID;
CREATE INDEX grc20_tokens_by_realm ON grc20_tokens (realm_hash);
CREATE TABLE grc20_balances (token TEXT NOT NULL, address TEXT NOT NULL, amount TEXT NOT NULL, PRIMARY KEY (token, address)) STRICT, WITHOUT ROWID;
CREATE INDEX grc20_balances_by_address ON grc20_balances (address);
CREATE TABLE grc20_days (token TEXT NOT NULL, day TEXT NOT NULL, transfers INTEGER NOT NULL, PRIMARY KEY (token, day)) STRICT, WITHOUT ROWID;
`;
const TABLES = ["state", "tokens", "balances", "days"].map((name) => `grc20_${name}`);
const DAY_MS = 86_400_000;
/** The answers kept, by realm hash and height: a read sorts every holder of three tokens, and the table only changes with the height. */
const ANSWERS_KEPT = 500;

/** An event of grc20's package, checked: a token announced, or an amount moved (a mint has no `from`, a burn no `to`). */
export type TokenEvent =
  | { kind: "new"; token: string; name: string; symbol: string; decimals: number }
  | { kind: "transfer"; token: string; from: string; to: string; value: bigint }
  /** An event of a token whose attributes failed: the token is no longer believable. */
  | { kind: "bad"; token: string };

/** The events of one transaction, at its block's height. */
export interface TokenTx {
  readonly height: number;
  readonly events: readonly TokenEvent[];
}

export interface TokenStore {
  /** The height up to which every event is replayed, none before a first page. */
  height: () => number | undefined;
  anchor: () => { height: number; time: string } | undefined;
  /** A batch replayed, its transfers dated by `dated`, every event up to `through` read; an event at or below the height kept is left out. */
  add: (batch: { txs: readonly TokenTx[]; dated: Dated; through: number; now: number }) => void;
  reset: () => void;
  /** Every token no longer believed and the height moved to `through`: events there could not be read, so none can be trusted. */
  unsure: (through: number) => void;
  /** A realm's tokens by the hash of its path, at most three; none for a realm with none. */
  answerOf: (realmHash: string) => TokenAnswer | undefined;
  /** The most a person holds of tokens, by amount in the token's own unit, `most` of them: for the person's card. */
  topTokensOf: (address: string, most: number) => HeldToken[];
}

// The days kept: the 30 ending on `now`'s.
function keepDays(db: DatabaseSync, now: number): void {
  const cutoff = new Date(now - (TOKEN_CAPS.days - 1) * DAY_MS).toISOString().slice(0, 10);
  db.prepare("DELETE FROM grc20_days WHERE day < ?").run(cutoff);
}

// The highest dated height with its block's time: what a later pass checks the chain still holds.
function anchorOf(dated: Dated): { height: number; time: string } | undefined {
  const [height] = [...dated.times.keys()].sort((a, b) => b - a);
  const time = height === undefined ? undefined : dated.times.get(height);
  return height === undefined || time === undefined ? undefined : { height, time };
}

/** The token state in `db`, for `universe` alone: rows of another are dropped at once. */
export function tokenStore(db: DatabaseSync, universe: string): TokenStore {
  const answers = new Map<string, TokenAnswer | undefined>();
  const reset = (): void => {
    answers.clear();
    transaction(db, () => {
      for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    });
  };
  if (db.prepare("SELECT 1 FROM grc20_state WHERE universe <> ?").get(universe) !== undefined) reset();
  const height = (): number | undefined => heightIn(db, "grc20_state", universe);
  const sql = statements(db);
  return {
    height,
    anchor: () => anchorIn(db, "grc20_state", universe),
    add: ({ txs, dated, through, now }) => {
      const kept = height() ?? -1;
      transaction(db, () => {
        fold(
          sql,
          txs.filter((tx) => tx.height > kept),
          dated,
        );
        keepDays(db, now);
        const anchor = anchorOf(dated);
        if (through > kept) sql.state.run(universe, through, anchor?.height ?? null, anchor?.time ?? null);
      });
    },
    reset,
    unsure: (through) => {
      answers.clear();
      transaction(db, () => {
        db.exec("UPDATE grc20_tokens SET ambiguous = 1, holders = 0, supply = '0'");
        db.exec("DELETE FROM grc20_balances");
        if (through > (height() ?? -1)) sql.state.run(universe, through, null, null);
      });
    },
    answerOf: (realmHash) => {
      const at = height() ?? 0;
      const key = `${String(at)}:${realmHash}`;
      if (answers.has(key)) return answers.get(key);
      const answer = answerFor(db, at, realmHash);
      remember(answers, [key, answer], ANSWERS_KEPT);
      return answer;
    },
    topTokensOf: (address, most) => heldBy(db, address, most),
  };
}
