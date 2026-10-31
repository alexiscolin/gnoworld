// The latest block of the hero's live line (frame 6, "BLOCK 1,203,885"): its height from lib/chain's readHeight, the host it
// was read from and how old the block is. No number without its source, and none at all while the read is on its way or failed.
import type { ChainRead } from "../../lib/chain/read.ts";
import { stampOf } from "./stamp.ts";
import styles from "./Live.module.css";

export function Height({ read, now }: { read: ChainRead<{ height: number; time: string }> | undefined; now: Date }) {
  let body = <span className={styles["state"]}>Reading the chain</span>;
  if (read?.ok === false) body = <span className={styles["state"]}>{read.failure.next}</span>;
  if (read?.ok === true) {
    const { height, time } = read.value;
    body = (
      <>
        <span className={styles["value"]} data-height="">
          {height.toLocaleString("en-US")}
        </span>
        <small className={styles["credit"]}>
          {new URL(read.source.url).hostname} · <time dateTime={time}>{stampOf(time, now)}</time>
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
