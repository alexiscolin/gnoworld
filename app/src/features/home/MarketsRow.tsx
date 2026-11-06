// The prices of the hero's live line (frames 1 to 8): each token that has a price, in the video's order, with its 24 hour
// change and its day's line (8i: frame 6's sparklines, a chunk of their own), then where the prices come from and how old they are. A token
// with no price is not drawn. The file missing or unreadable is a state in words, never a gap and never a number.
import type { MarketToken } from "@gnoworld/schemas";
import { Cluster } from "@gnoworld/ui";
import { lazy, Suspense } from "react";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { stampOf } from "./stamp.ts";
import styles from "./Live.module.css";

const Spark = lazy(() => import("./Spark.tsx"));

// As frame 6 writes them: a thousand and more whole and grouped ("66,601"), a dollar and more to the cent, less than a dollar to three
// significant digits ("0.398"), so a fraction of a cent never reads as zero.
const dollars = (usd: number): string =>
  usd >= 1000
    ? usd.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : usd >= 1
      ? usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : usd.toLocaleString("en-US", { maximumSignificantDigits: 3, maximumFractionDigits: 20 });

// The change to a tenth, and which way it went: none when the source gives none.
const tenthsOf = (percent: number | null): number | null => (percent === null ? null : Math.round(percent * 10) / 10);
const directionOf = (tenths: number | null): "up" | "down" | "flat" =>
  tenths === null || tenths === 0 ? "flat" : tenths > 0 ? "up" : "down";

// "▼ 3.0% · 24 h" (frame 6): the arrow says the way, read as rose or fell.
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
      {Math.abs(tenths).toFixed(1)}% · 24 h
    </span>
  );
}

function Token({ token }: { token: MarketToken }) {
  return (
    <div data-token={token.symbol} className={styles["token"]}>
      <div>
        <small className={styles["label"]}>{token.symbol}</small>
        <span className={styles["value"]}>
          {dollars(token.usd)}
          <small className={styles["unit"]}> USD</small>
        </span>
        <Change percent={token.change24h} />
      </div>
      {/* The line's room is kept while it comes, so the row does not move. */}
      <span className={styles["spark"]}>
        <Suspense fallback={null}>
          <Spark symbol={token.symbol} tone={directionOf(tenthsOf(token.change24h))} />
        </Suspense>
      </span>
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
