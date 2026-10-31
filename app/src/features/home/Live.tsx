// The hero's live line (frames 1 to 8): the prices and the latest block, each read once as the page loads in the browser,
// never in the build, so the page written holds states and no number. No poll and no timer left; the reads answer for
// themselves, and a page that leaves, or a universe that changes, ends the reads it no longer wants.
import { Cluster } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { readMarkets, type MarketsRead } from "../../lib/api/markets.ts";
import { failedRead, type ChainRead } from "../../lib/chain/read.ts";
import { readHeight } from "../../lib/chain/rpc.ts";
import { Height } from "./Height.tsx";
import styles from "./Live.module.css";
import { MarketsRow } from "./MarketsRow.tsx";

type Block = ChainRead<{ height: number; time: string }>;

export function Live({ rpc }: { rpc: string }) {
  const [markets, setMarkets] = useState<MarketsRead>();
  const [block, setBlock] = useState<{ rpc: string; read: Block }>();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const controller = new AbortController();
    const done = (read: MarketsRead) => {
      if (controller.signal.aborted) return;
      setMarkets(read);
      setNow(new Date());
    };
    void readMarkets(undefined, { signal: controller.signal }).then(done, () => {
      done({ ok: false, reason: "network" });
    });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const done = (read: Block) => {
      if (controller.signal.aborted) return;
      setBlock({ rpc, read });
      setNow(new Date());
    };
    void readHeight(rpc, { signal: controller.signal }).then(done, () => {
      done(failedRead("down", { url: rpc, at: new Date().toISOString() }));
    });
    return () => {
      controller.abort();
    };
  }, [rpc]);

  return (
    <div className={styles["live"]} data-hero="markets">
      <Cluster space="l">
        <MarketsRow read={markets} now={now} />
        <Height read={block?.rpc === rpc ? block.read : undefined} now={now} />
      </Cluster>
    </div>
  );
}
