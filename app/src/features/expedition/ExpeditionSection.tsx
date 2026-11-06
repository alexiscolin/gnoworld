// The passport's expedition (slice 8; no frame: built from the design system, Alexis's answer 2): today's three stops, the same for everyone
// and new each UTC day, each a row to its world, reached or why to go; how many are reached, and the streak of days all three were.
import { reachedOn, streakOn, utcDay } from "@gnoworld/core";
import { Kicker, PlanetThumb, Progress, Row, Stack } from "@gnoworld/ui";
import { useState } from "react";
import { useApp } from "../../storeContext.tsx";
import { stopsOn } from "./stops.ts";

/** Today's expedition of the universe the passport counts; nothing where the pool holds no stop. */
export function ExpeditionSection({ universe }: { readonly universe: string }) {
  // The day the dialog opened on: a dialog left open past midnight shows the day it opened, as the arrival that reached its stops.
  const [today] = useState(() => utcDay(new Date()));
  const done = useApp(({ device }) => device.expedition);
  const days = useApp(({ device }) => streakOn(device.streak, today));
  const stops = stopsOn(universe, today);
  if (stops.length === 0) return null;
  const reached = new Set(reachedOn(done, today));
  const count = stops.filter(({ key }) => reached.has(key)).length;
  const streak = days === 0 ? "" : ` · ${String(days)}-day streak`;
  return (
    <Stack as="section" space="s">
      <Kicker>{`Today's expedition · same for everyone, new each day${streak}`}</Kicker>
      <Progress
        label="Today's expedition, stops reached"
        value={count}
        max={stops.length}
        kind="steps"
        shown={`${String(count)} of ${String(stops.length)}`}
      />
      <div>
        {stops.map(({ id, name, why, path, key }) => (
          <Row
            key={id}
            look="divided"
            title={name}
            subtitle={reached.has(key) ? "Reached today" : why}
            href={path}
            lead={<PlanetThumb src="" name={name} decorative />}
          />
        ))}
      </div>
    </Stack>
  );
}
