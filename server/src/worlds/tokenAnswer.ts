// What the token tables answer: a realm's tokens for the route, and a person's holdings for their card. Both read the database alone.
import { tokenIdOf, TOKEN_CAPS, type TokenAnswer } from "@gnoworld/schemas/indexer";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export interface HeldToken {
  readonly realm: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly amount: string;
}

const Tokens = z.array(
  z.object({
    token: z.string(),
    symbol: z.string(),
    name: z.string(),
    decimals: z.number(),
    supply: z.string(),
    holders: z.number(),
    ambiguous: z.number(),
    last_height: z.nullable(z.number()),
    last_day: z.nullable(z.string()),
  }),
);
const Top = z.array(z.object({ address: z.string(), amount: z.string() }));
const Days = z.array(z.object({ day: z.string(), transfers: z.number() }));
const Held = z.array(
  z.object({ token: z.string(), symbol: z.string(), name: z.string(), decimals: z.number(), amount: z.string() }),
);

// Amounts are canonical decimal text, so a longer one is greater and equal lengths compare as text.
const BY_AMOUNT = "length(amount) DESC, amount DESC";

/** A realm's tokens by the hash of its path, at most three; none for a realm with none. A token not believed shows no holders. */
export function answerFor(db: DatabaseSync, height: number, realmHash: string): TokenAnswer | undefined {
  const tokens = Tokens.parse(
    db
      .prepare(`SELECT * FROM grc20_tokens WHERE realm_hash = ? ORDER BY token LIMIT ${String(TOKEN_CAPS.perRealm)}`)
      .all(realmHash),
  );
  if (tokens.length === 0) return undefined;
  const top = (token: string) =>
    Top.parse(
      db
        .prepare(
          `SELECT address, amount FROM grc20_balances WHERE token = ? ORDER BY ${BY_AMOUNT}, address LIMIT ${String(TOKEN_CAPS.holders)}`,
        )
        .all(token),
    );
  return {
    height,
    tokens: tokens.map((token) => {
      const believed = token.ambiguous === 0;
      const { last_day: day, last_height: at } = token;
      return {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        ambiguous: !believed,
        supply: believed ? token.supply : null,
        holders: believed ? token.holders : null,
        top: believed ? top(token.token) : [],
        days: Days.parse(
          db.prepare("SELECT day, transfers FROM grc20_days WHERE token = ? ORDER BY day").all(token.token),
        ),
        last: day === null || at === null ? null : { day, height: at },
      };
    }),
  };
}

/** The most a person holds of tokens, `most` of them by amount in the token's own unit, a token not believed left out. */
export function heldBy(db: DatabaseSync, address: string, most: number): HeldToken[] {
  return Held.parse(
    db
      .prepare(
        `SELECT t.token AS token, t.symbol AS symbol, t.name AS name, t.decimals AS decimals, b.amount AS amount
         FROM grc20_balances b JOIN grc20_tokens t ON t.token = b.token
         WHERE b.address = ? AND t.ambiguous = 0
         ORDER BY length(b.amount) DESC, b.amount DESC, t.token LIMIT ${String(Math.max(0, Math.floor(most)))}`,
      )
      .all(address),
  ).flatMap(({ token, ...rest }) => {
    const realm = tokenIdOf(token)?.realm;
    return realm === undefined ? [] : [{ realm, ...rest }];
  });
}
