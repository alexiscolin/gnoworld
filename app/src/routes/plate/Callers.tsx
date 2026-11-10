// Who calls it (the proposal's cal card, D566): the callers per day as a line, then the rollup's top callers by calls, each with its share as a bar,
// named as the worlds' file names them; eight, and all twenty once the card is open.
import { useState, type CSSProperties } from "react";
import { Avatar, Card, Cell, Grid, Sparkline, Stack } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { dayValues } from "./days.ts";
import { grouped } from "./figures.ts";
import { callerName } from "./names.ts";
import styles from "./Callers.module.css";

const OPENS_WITH = 8;

export function Callers({ rollup, worlds }: { rollup: RealmRollup; worlds: Worlds["worlds"] | undefined }) {
  const [open, setOpen] = useState(false);
  const { top, callers } = rollup;
  if (top.length === 0) return null;
  const days = dayValues(rollup.days, rollup.updated).map((day) => day.callers);
  const shown = open ? top : top.slice(0, OPENS_WITH);
  const most = top[0]?.calls ?? 1;
  return (
    <Cell span={open ? 12 : 4}>
      <Card look="hub" fixed rises open={open}>
        <Card.Header
          title="Who calls it"
          level={2}
          hint="per day"
          expand={{
            open,
            onToggle: () => {
              setOpen(!open);
            },
          }}
        />
        <Card.Body>
          <Stack space="s">
            {days.length < 2 ? null : (
              <div
                className={styles["spark"]}
                role="img"
                aria-label={`Distinct callers per day, peak ${String(Math.max(...days))}`}
              >
                <Sparkline values={days} tone="flat" from="zero" fills arrives />
              </div>
            )}
            <Stack as="ul" space="xs">
              {shown.map(({ address, calls }, at) => (
                <li key={address} className={styles["caller"]}>
                  <Grid template="icon-text-meta" space="xs">
                    <Avatar address={address} name={callerName(worlds, address)} decorative />
                    <Stack space="2xs">
                      <span className="truncate">{callerName(worlds, address)}</span>
                      <span className={styles["track"]}>
                        <i
                          style={
                            {
                              inlineSize: `${Math.max(3, (calls / most) * 100).toFixed(1)}%`,
                              "--j": at,
                            } as CSSProperties
                          }
                        />
                      </span>
                    </Stack>
                    <span className={styles["count"]}>{grouped(calls)}</span>
                  </Grid>
                </li>
              ))}
            </Stack>
            {callers > shown.length ? (
              <p className={styles["more"]}>{`+ ${grouped(callers - shown.length)} more addresses`}</p>
            ) : null}
          </Stack>
        </Card.Body>
      </Card>
    </Cell>
  );
}
