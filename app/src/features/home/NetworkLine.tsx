// One line of the universe's health under the hero's count: "Onyx today: 213 transactions · 9 accounts" and the last 14 days' transactions
// as a small line. A chain whose last block is old says so instead; no answer, or one of another day, draws nothing. A late chunk.
import { Sparkline } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { agoText, dayKey } from "../../lib/days.ts";
import { queryClient } from "../../lib/query/client.ts";
import { useClock } from "./clock.ts";
import styles from "./NetworkLine.module.css";
import { networkOptions } from "./networkQuery.ts";
import { plural } from "../../lib/plural.ts";

/** A last block older than this is a halted chain. */
const STALE_MS = 10 * 60_000;

export default function NetworkLine({ name }: { name: string }) {
  const { data } = useQuery(networkOptions, queryClient);
  const now = useClock();
  const today = data?.days.at(-1);
  if (data === undefined || today === undefined) return null;
  const quiet = now.getTime() - Date.parse(data.tip.time);
  // The pass's day is not today's: the job is not running, and a figure of another day would be called today's.
  if (quiet <= STALE_MS && today.day !== dayKey(now, "UTC")) return null;
  const words =
    quiet > STALE_MS
      ? `Last block ${agoText(Date.parse(data.tip.time), now.getTime())}`
      : `${name} today: ${plural(today.txs, "transaction")} · ${plural(today.accounts, "account")}`;
  return (
    <p
      className={`inline-center ${String(styles["line"])}`}
      data-hero="network"
      title={`${today.day} (UTC), last block ${agoText(Date.parse(data.tip.time), now.getTime())}`}
    >
      {words}
      <span className={styles["spark"]}>
        <Sparkline values={data.days.map(({ txs }) => txs)} tone="flat" from="zero" fills />
      </span>
    </p>
  );
}
