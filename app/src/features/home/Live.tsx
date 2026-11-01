// The hero's live line (frames 1 to 8): the prices and the latest block, both from markets.json, read once as the page loads in
// the browser, never in the build, so the page written holds states and no number. The block is the default universe's, read by the
// server's timer: the browser asks no chain. No poll and no timer left; a page that leaves ends the read.
import { Cluster } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { readMarkets, type MarketsRead } from "../../lib/api/markets.ts";
import { Height } from "./Height.tsx";
import styles from "./Live.module.css";
import { MarketsRow } from "./MarketsRow.tsx";

// The line is hidden under 900 px (Live.module.css), where a read would show nothing; a window that widens reads then.
const PHONE = "(max-width: 899px)";
const phone = (): MediaQueryList | undefined =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(PHONE) : undefined;
function useWide(): boolean {
  // Not wide only where the browser says so: the build, which has no window, and a browser without matchMedia, read.
  const [wide, setWide] = useState(() => phone()?.matches !== true);
  useEffect(() => {
    const query = phone();
    if (query === undefined) return;
    const follow = () => {
      setWide(!query.matches);
    };
    query.addEventListener("change", follow);
    return () => {
      query.removeEventListener("change", follow);
    };
  }, []);
  return wide;
}

/** `withBlock`: the file's height is the default universe's, so the block is drawn for that universe's home alone. */
export function Live({ withBlock }: { withBlock: boolean }) {
  const wide = useWide();
  const [markets, setMarkets] = useState<MarketsRead>();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!wide) return;
    const controller = new AbortController();
    void readMarkets(undefined, { signal: controller.signal }).then(
      (read) => {
        if (controller.signal.aborted) return;
        setMarkets(read);
        setNow(new Date());
      },
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, [wide]);

  return (
    <div className={styles["live"]} data-hero="markets">
      <Cluster space="l">
        <MarketsRow read={markets} now={now} />
        {withBlock ? <Height read={markets} now={now} /> : null}
      </Cluster>
    </div>
  );
}
