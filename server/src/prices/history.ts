// The prices' history (slice 8, 8i; the markets row's sparklines, frame 6): each token's price at each of the prices timer's reads over the
// last day, oldest first, kept in a file beside markets.json so a restart keeps the day, and served at GET /api/markets/history. What the file
// holds is read back through its schema: a file refused, or older than a day, starts the day again.
import { MARKETS_HISTORY_MOST, MarketsHistory } from "@gnoworld/schemas/indexer";
import { MARKET_SYMBOLS, type Markets } from "@gnoworld/schemas";
import { Hono } from "hono";
import { lastFile, replaceFile } from "../replaceFile.ts";

const DAY_MS = 24 * 3_600_000;

/** A line shorter than this (an hour of reads) is too short to draw a curve: the history may be seeded. */
export const SEED_BELOW = 12;

export interface History {
  /** Whether a day is still to be seeded: none yet, or a line under SEED_BELOW prices. */
  short: () => boolean;
  /** Each line given replaces the token's own when that is under SEED_BELOW prices, the last MARKETS_HISTORY_MOST kept. Whether the file took it. */
  seed: (lines: { symbol: Markets["tokens"][number]["symbol"]; usd: number[] }[], at: number) => boolean;
  /** The prices of a read at `at`, each at the end of its token's line. Whether the file took them. */
  add: (tokens: Markets["tokens"], at: number) => boolean;
  /** The day so far; none before the first price. */
  current: () => MarketsHistory | undefined;
}

// The file as it was left, or none: missing, unreadable, refused by its schema, or older than a day.
function kept(file: string, now: number): MarketsHistory | undefined {
  const parsed = lastFile(file, MarketsHistory);
  return parsed !== undefined && now - Date.parse(parsed.updated) < DAY_MS ? parsed : undefined;
}

export function makeHistory(file: string, now: () => number): History {
  let day = kept(file, now());
  return {
    short: () => day === undefined || day.tokens.some(({ usd }) => usd.length < SEED_BELOW),
    seed(seeded, at) {
      const own = new Map((day?.tokens ?? []).map(({ symbol, usd }) => [symbol, usd]));
      const lines = new Map(own);
      for (const { symbol, usd } of seeded) {
        if ((own.get(symbol)?.length ?? 0) < SEED_BELOW) lines.set(symbol, usd.slice(-MARKETS_HISTORY_MOST));
      }
      day = MarketsHistory.parse({
        updated: day?.updated ?? new Date(at).toISOString(),
        // The lines in the video's order, whichever the seeding gave first.
        tokens: MARKET_SYMBOLS.flatMap((symbol) => {
          const usd = lines.get(symbol);
          return usd === undefined ? [] : [{ symbol, usd }];
        }),
      });
      return replaceFile(file, `${JSON.stringify(day)}\n`);
    },
    add(tokens, at) {
      const lines = new Map((day?.tokens ?? []).map(({ symbol, usd }) => [symbol, usd]));
      const read = new Map(tokens.map(({ symbol, usd }) => [symbol, usd]));
      // A token that had no price at a read keeps its line as it was; the lines keep the video's order.
      day = MarketsHistory.parse({
        updated: new Date(at).toISOString(),
        tokens: MARKET_SYMBOLS.filter((symbol) => lines.has(symbol) || read.has(symbol)).map((symbol) => {
          const usd = read.get(symbol);
          const line = lines.get(symbol) ?? [];
          return { symbol, usd: usd === undefined ? line : [...line, usd].slice(-MARKETS_HISTORY_MOST) };
        }),
      });
      return replaceFile(file, `${JSON.stringify(day)}\n`);
    },
    current: () => day,
  };
}

/** GET /: the day so far, which any cache may keep a minute; a 404 before the first price, as markets.json's. */
export function historyRoutes(history: () => MarketsHistory | undefined): Hono {
  const routes = new Hono();
  routes.get("/", (c) => {
    const day = history();
    c.header("cache-control", "public, max-age=60");
    if (day === undefined) return c.json({ error: "not_ready" }, 404);
    return c.json(day);
  });
  return routes;
}
