// The market card among a room's lines (Alexis, 2026-11-11), the reader's alone: GNOT, ATONE and BTC, each a row: its price in dollars, its 24 hour
// change and the day's small chart, the high and the low in the row's title (Alexis, 2026-11-11: a card a third as high, and `/market`). Restored from the home's old prices row (D425). A chunk of its own, asked when the
// card is first drawn. Loading, missing and failed are states in words, never a gap and never a number.
import type { MarketToken } from "@gnoworld/schemas";
import { Card, EmptyState, Sparkline, Stack } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { isUnread, queryClient } from "../../lib/query/client.ts";
import { stampOf } from "../../stamp.ts";
import { directionOf, dollars, rangeOf, tenthsOf } from "./marketFormat.ts";
import styles from "./MarketCard.module.css";
import { marketsOptions } from "./marketQueries.ts";
import { useMarketHistory } from "./useMarketHistory.ts";

// "▼ 3.0% · 24 h": the arrow says the way, read as rose or fell.
function Change({ percent }: { percent: number | null }) {
  const tenths = tenthsOf(percent);
  if (tenths === null) return null;
  const direction = directionOf(tenths);
  return (
    <span className={styles["delta"]} data-delta={direction}>
      {direction === "flat" ? null : (
        <>
          <span aria-hidden="true">{direction === "up" ? "▲ " : "▼ "}</span>
          <span className="visually-hidden">{direction === "up" ? "rose " : "fell "}</span>
        </>
      )}
      {Math.abs(tenths).toFixed(1)}%<span className={styles["window"]}> · 24 h</span>
    </span>
  );
}

// One row a token: its symbol, price and change, and the day's line at the row's own size, its low and high in the row's title.
function Token({ token, line }: { token: MarketToken; line: readonly number[] | undefined }) {
  const tone = directionOf(tenthsOf(token.change24h));
  const drawn = line !== undefined && line.length >= 2;
  return (
    <section data-token={token.symbol} aria-label={token.symbol} title={drawn ? rangeOf(line) : undefined}>
      <div className={styles["row"]}>
        <span className={styles["symbol"]}>
          <small className="label">{token.symbol}</small>
        </span>
        <span className={styles["price"]}>
          {dollars(token.usd)}
          <small className={styles["unit"]}> USD</small>
        </span>
        <Change percent={token.change24h} />
        <span className={styles["spark"]}>{drawn ? <Sparkline values={line} tone={tone} /> : null}</span>
      </div>
    </section>
  );
}

function State({ state, words }: { state: "loading" | "missing" | "empty"; words: string }) {
  return (
    <p className="meta" data-markets={state} role="status">
      {words}
    </p>
  );
}

const NO_TOKENS: readonly string[] = [];

/** The card for a read of the prices and the day's lines (none while they come), drawn at `now`. */
export function MarketCardView({
  read,
  lines,
  now,
  only = NO_TOKENS,
  onRetry,
}: {
  read: MarketsRead | undefined;
  lines: ReadonlyMap<string, readonly number[]> | undefined;
  now: Date;
  /** The tokens to show when some alone (`/market gnot`); none is all of them. */
  only?: readonly string[] | undefined;
  /** Asks the prices again. */
  onRetry?: () => void;
}) {
  const body = (() => {
    if (read === undefined) return <State state="loading" words="Reading the prices" />;
    if (!read.ok) {
      return read.reason === "missing" ? (
        <State state="missing" words="Prices are not available yet. Check back in a few minutes." />
      ) : (
        <EmptyState
          look="failed"
          line="The prices could not be read."
          {...(onRetry === undefined ? {} : { onRetry })}
        />
      );
    }
    const tokens = read.markets.tokens.filter((token) => only.length === 0 || only.includes(token.symbol));
    if (tokens.length === 0) return <State state="empty" words="No price to show" />;
    return tokens.map((token) => <Token key={token.symbol} token={token} line={lines?.get(token.symbol)} />);
  })();
  const hint = read?.ok === true ? `CoinGecko · ${stampOf(read.markets.updated, now)}` : "CoinGecko";
  return (
    <Card compact>
      <Card.Header icon="chart" kicker="Prices · 24 h" title="Market chart" hint={hint} />
      <div data-market-card="" className={styles["body"]}>
        <Stack space="xs">{body}</Stack>
      </div>
    </Card>
  );
}

// The prices as the card shows them: the file, or why it did not come; none while the first read is asked.
function useMarkets(): MarketsRead | undefined {
  const { data, error } = useQuery(marketsOptions, queryClient);
  if (data !== undefined) return { ok: true, markets: data };
  return isUnread<MarketsRead>(error) ? error.read : undefined;
}

export default function MarketCard({ only }: { only?: readonly string[] | undefined }) {
  const read = useMarkets();
  const lines = useMarketHistory();
  const [now] = useState(() => new Date());
  const retry = () => {
    queryClient.refetchQueries(marketsOptions).catch(reportError);
  };
  return <MarketCardView read={read} lines={lines} now={now} only={only} onRetry={retry} />;
}
