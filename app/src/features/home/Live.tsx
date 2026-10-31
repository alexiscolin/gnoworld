// The hero's live line (frames 1 to 8): the prices and the latest block, each read once as the page loads in the browser,
// never in the build, so the page written holds states and no number. No poll and no timer left; the reads answer for
// themselves, and a page that leaves, or a universe that changes, ends the reads it no longer wants.
import { Cluster } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { readMarkets, type MarketsRead } from "../../lib/api/markets.ts";
import type { ChainRead } from "../../lib/chain/read.ts";
import { readHeight } from "../../lib/chain/rpc.ts";
import { Height } from "./Height.tsx";
import styles from "./Live.module.css";
import { MarketsRow } from "./MarketsRow.tsx";

type Block = ChainRead<{ height: number; time: string }>;

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

export function Live({ rpc }: { rpc: string }) {
  const wide = useWide();
  const [markets, setMarkets] = useState<MarketsRead>();
  const [block, setBlock] = useState<{ rpc: string; read: Block }>();
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

  useEffect(() => {
    if (!wide) return;
    const controller = new AbortController();
    const done = (read: Block) => {
      if (controller.signal.aborted) return;
      setBlock({ rpc, read });
      setNow(new Date());
    };
    void readHeight(rpc, { signal: controller.signal }).then(done, () => undefined);
    return () => {
      controller.abort();
    };
  }, [rpc, wide]);

  return (
    <div className={styles["live"]} data-hero="markets">
      <Cluster space="l">
        <MarketsRow read={markets} now={now} />
        <Height read={block?.rpc === rpc ? block.read : undefined} now={now} />
      </Cluster>
    </div>
  );
}
