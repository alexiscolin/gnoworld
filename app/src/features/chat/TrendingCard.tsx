// The /trending card among a room's lines: the universe's most called worlds of the last 7 days, ranked by people a day, as the
// server's ranking gives them. Each row flies to the world as the app's world links do. A chunk of its own, asked when the first card is drawn.
import { cutText } from "@gnoworld/core/bubbles";
import { shortAddress } from "@gnoworld/schemas";
import { Card, grouped, Row } from "@gnoworld/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { queryClient } from "../../lib/query/client.ts";
import { realmView, site } from "../../places.ts";
import shared from "./lists.module.css";
import styles from "./SharedCard.module.css";
import { trendingOptions } from "./trendingQueries.ts";

const calls = (n: number): string => `${grouped(n)} ${n === 1 ? "call" : "calls"}`;

export default function TrendingCard() {
  const universe = site.universeAt(useLocation().pathname);
  // Only the default universe's worlds are read by the server's job.
  const { data, isError } = useQuery({ ...trendingOptions, enabled: universe.isDefault }, queryClient);
  const items = data?.items ?? [];
  let words: string | undefined;
  if (!universe.isDefault) words = "Only gno.land's worlds are ranked.";
  else if (isError) words = "The ranking is not available yet. Check back in a few minutes.";
  else if (data === undefined) words = "Reading the ranking";
  else if (items.length === 0) words = "No world was called this week.";
  return (
    <Card compact>
      <Card.Header icon="chart" kicker="Last 7 days" title="Most called worlds" />
      <div data-trending-card="" className={styles["body"]}>
        {words === undefined ? (
          <ol className={shared["plain"]}>
            {items.map((item, at) => (
              <li key={item.world}>
                <Row
                  look="plain"
                  lead={<span className={styles["rank"]}>{at + 1}</span>}
                  title={cutText(item.title, 40)}
                  {...(item.owner === null ? {} : { subtitle: shortAddress(item.owner) })}
                  trail={<span className={styles["calls"]}>{calls(item.calls)}</span>}
                  href={realmView(item.realm, universe)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="meta" role="status">
            {words}
          </p>
        )}
        <p className="meta">
          Ranked by people a day{data === undefined ? "" : ` · ${String(data.called)} worlds called`}
        </p>
      </div>
    </Card>
  );
}
