// The prices' history (slice 8, 8i; the markets row's sparklines, frame 6): each token's price at each of the prices timer's reads over the
// last day, oldest first, kept in a file beside markets.json so a restart keeps the day, and served at GET /api/markets/history. What the file
// holds is read back through its schema: a file refused, or older than a day, starts the day again.
import { readFileSync } from "node:fs";
import { MARKETS_HISTORY_MOST, MarketsHistory } from "@gnoworld/schemas/indexer";
import type { Markets } from "@gnoworld/schemas";
import { Hono } from "hono";
import { replaceFile } from "../replaceFile.ts";

const DAY_MS = 24 * 3_600_000;

export interface History {
  /** The prices of a read at `at`, each at the end of its token's line. Whether the file took them. */
  add: (tokens: Markets["tokens"], at: number) => boolean;
  /** The day so far; none before the first price. */
  current: () => MarketsHistory | undefined;
}

// The file as it was left, or none: missing, unreadable, refused by its schema, or older than a day.
function kept(file: string, now: number): MarketsHistory | undefined {
  try {
    const parsed = MarketsHistory.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success && now - Date.parse(parsed.data.updated) < DAY_MS ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function makeHistory(file: string, now: () => number): History {
  let day = kept(file, now());
  return {
    add(tokens, at) {
      const lines = new Map((day?.tokens ?? []).map(({ symbol, usd }) => [symbol, usd]));
      // A token that had no price at a read keeps its line as it was; the lines keep the tokens' order.
      day = MarketsHistory.parse({
        updated: new Date(at).toISOString(),
        tokens: tokens.map(({ symbol, usd }) => ({
          symbol,
          usd: [...(lines.get(symbol) ?? []), usd].slice(-MARKETS_HISTORY_MOST),
        })),
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
