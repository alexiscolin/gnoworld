// The prices of the hero's live line (frames 1 to 8): each token that has a price, in the video's order, with its 24 hour
// change, then where the prices come from and how old they are. A token with no price is not drawn. The file missing or
// unreadable is a state in words, never a gap and never a number.
import type { MarketToken } from "@gnoworld/schemas";
import { Cluster } from "@gnoworld/ui";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { stampOf } from "./stamp.ts";
import styles from "./Live.module.css";

// To the cent from a cent up; below it, three significant digits, so a fraction of a cent never reads as zero.
const dollars = (usd: number): string =>
  usd >= 0.01
    ? usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : usd.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 });

function Change({ percent }: { percent: number | null }) {
  if (percent === null) return null;
  const tenths = Math.round(percent * 10) / 10;
  const direction = tenths === 0 ? "flat" : tenths > 0 ? "up" : "down";
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";
  return (
    <span className={styles["delta"]} data-delta={direction}>
      {sign}
      {Math.abs(tenths).toFixed(1)}%
    </span>
  );
}

function Token({ token }: { token: MarketToken }) {
  return (
    <div data-token={token.symbol}>
      <small className={styles["label"]}>{token.symbol}</small>
      <span className={styles["value"]}>${dollars(token.usd)}</span>
      <Change percent={token.change24h} />
    </div>
  );
}

function State({ state, words }: { state: "loading" | "missing" | "failed"; words: string }) {
  return (
    <p className={styles["state"]} data-markets={state} role="status">
      {words}
    </p>
  );
}

export function MarketsRow({ read, now }: { read: MarketsRead | undefined; now: Date }) {
  if (read === undefined) return <State state="loading" words="Reading the prices" />;
  if (!read.ok) {
    return read.reason === "missing" ? (
      <State state="missing" words="Prices are not available yet. Check back in a few minutes." />
    ) : (
      <State state="failed" words="The prices could not be read. Reload the page to try again." />
    );
  }
  const { source, updated, tokens } = read.markets;
  const credit = (
    <small className={styles["credit"]}>
      {source} · <time dateTime={updated}>{stampOf(updated, now)}</time>
    </small>
  );
  if (tokens.length === 0) {
    return (
      <div data-markets="empty">
        <Cluster space="l">
          <p className={styles["state"]} role="status">
            No price to show
          </p>
          {credit}
        </Cluster>
      </div>
    );
  }
  return (
    <div data-markets="row">
      <Cluster space="l">
        {tokens.map((token) => (
          <Token key={token.symbol} token={token} />
        ))}
        {credit}
      </Cluster>
    </div>
  );
}
