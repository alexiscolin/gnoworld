// The latest block of the hero's live line (frame 6, "BLOCK 1,203,885"): the height the server read from the default universe's RPC
// and wrote in markets.json, the host it was read from and when the block was made. No number without its source, and none at all
// while the read is on its way, the file is missing or holds no height.
import type { MarketsRead } from "../../lib/api/markets.ts";
import { stampOf } from "./stamp.ts";
import styles from "./Live.module.css";

export function Height({ read, now }: { read: MarketsRead | undefined; now: Date }) {
  let body = <span className={styles["state"]}>Reading the chain</span>;
  if (read !== undefined) {
    const block = read.ok ? read.markets.block : undefined;
    body =
      block === undefined ? (
        <span className={styles["state"]}>Block height not available</span>
      ) : (
        <>
          <span className={styles["value"]} data-height="">
            {block.height.toLocaleString("en-US")}
          </span>
          <small className={styles["credit"]}>
            {block.host} · <time dateTime={block.time}>{stampOf(block.time, now)}</time>
          </small>
        </>
      );
  }
  return (
    <div data-block="">
      <small className={styles["label"]}>Block</small>
      {body}
    </div>
  );
}
