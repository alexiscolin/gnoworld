// The passport's expedition: today's three stops, the same for everyone and new each UTC day, on a route, the time to the next one, the badge
// of the day to earn and one button to the next stop; how many are reached, and the streak of days all three were.
import { streakOn, utcDay } from "@gnoworld/core";
import { Badge, Button, Card, Cluster, Grid, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { Link } from "react-router";
import { shortDay } from "../../lib/days.ts";
import { discOf } from "../../lib/worldDisc.ts";
import { useApp } from "../../storeContext.tsx";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import styles from "./Expedition.module.css";
import { progressOn } from "./next.ts";

const HOUR = 3_600_000;
const MINUTE = 60_000;

// The time left of the UTC day, as the card says it.
function untilNext(now: Date): string {
  const left = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  return `New route in ${String(Math.floor(left / HOUR))} h ${String(Math.floor((left % HOUR) / MINUTE))} min`;
}

/** Today's expedition of the universe the passport counts; nothing where the pool holds no stop. */
export function ExpeditionSection({ universe }: { readonly universe: string }) {
  // The day the dialog opened on: a dialog left open past midnight shows the day it opened, as the arrival that reached its stops.
  const [now] = useState(() => new Date());
  const today = utcDay(now);
  const done = useApp(({ device }) => device.expedition);
  const days = useApp(({ device }) => streakOn(device.streak, today));
  const { stops, reached, count, next } = progressOn(universe, today, done);
  if (stops.length === 0) return null;
  return (
    <Card>
      <Card.Header
        title="Three worlds, the same for everyone"
        kicker="Today's expedition"
        state={untilNext(now)}
        level={3}
      />
      <Card.Body>
        <Stack space="m">
          <p className="meta">
            {`Visit all ${String(stops.length)} today. Everyone on gnoworld gets the same route; tomorrow brings another.`}
          </p>
          <div className={styles["route"]}>
            <Grid min="s" space="m" as="ul">
              {stops.map(({ id, world, name, why, path, key }) => (
                <li key={id} className={styles["stop"]}>
                  <WorldPlanet world={world} fallback={discOf(world)} name={name} size="l" decorative />
                  <Link to={path} className={styles["name"]}>
                    {name}
                  </Link>
                  <span className={["meta", styles["line"], reached.has(key) ? styles["reached"] : ""].join(" ")}>
                    {reached.has(key) ? "Reached today" : why}
                  </span>
                </li>
              ))}
            </Grid>
          </div>
          <Cluster justify="between" space="m">
            <Cluster space="xs" wrap="no">
              <div className={styles["reward"]}>
                <Badge
                  name={shortDay(now, now, { timeZone: "UTC" })}
                  icon="map"
                  tone="warm"
                  earned={next === undefined}
                />
              </div>
              <p className="meta">
                {`Visit all ${String(stops.length)} for today's gold stamp. ${String(count)} of ${String(stops.length)} so far.`}
                {days === 0 ? "" : ` ${String(days)}-day streak.`}
              </p>
            </Cluster>
            {next === undefined ? null : (
              <Button
                emphasis="solid"
                href={next.path}
              >{`${count === 0 ? "Start with" : "Next:"} ${next.name}`}</Button>
            )}
          </Cluster>
        </Stack>
      </Card.Body>
    </Card>
  );
}
