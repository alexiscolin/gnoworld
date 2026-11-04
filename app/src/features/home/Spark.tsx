// A token's day of prices beside its price (8i; frame 6's markets row): the server's history (GET /api/markets/history, the prices timer's
// reads of the last day), read once for the three tokens, drawn as the design system's sparkline in the change's tone. A chunk of its own,
// asked by the markets row once the prices came: the first screen holds neither the schema nor the drawing. No history, no line.
import { MARKETS_HISTORY_MAX_BYTES, MarketsHistory } from "@gnoworld/schemas/indexer";
import type { MarketToken } from "@gnoworld/schemas";
import { Sparkline, type SparklineProps } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { readSiteFile } from "../../lib/chain/transport.ts";

/** The server's history of the prices, at this site's root. */
const HISTORY_URL = "/api/markets/history";

// One read for the row's three lines, asked by the first and shared; a read that failed is asked again by the next page that draws them.
let asked: Promise<MarketsHistory | undefined> | undefined;
function history(): Promise<MarketsHistory | undefined> {
  asked ??= readSiteFile(HISTORY_URL, MarketsHistory, { maxBytes: MARKETS_HISTORY_MAX_BYTES }).then((read) => {
    if (read === undefined) asked = undefined;
    return read;
  });
  return asked;
}

export default function Spark({ symbol, tone }: { symbol: MarketToken["symbol"]; tone: SparklineProps["tone"] }) {
  const [line, setLine] = useState<readonly number[]>();
  useEffect(() => {
    let drawn = true;
    // A history that did not come whole is none; only a fault of this code would reject, and the page reports it.
    history()
      .then((read) => {
        if (drawn) setLine(read?.tokens.find((token) => token.symbol === symbol)?.usd);
      })
      .catch((error: unknown) => {
        reportError(error);
      });
    return () => {
      drawn = false;
    };
  }, [symbol]);
  return line === undefined ? null : <Sparkline values={line} tone={tone} />;
}
