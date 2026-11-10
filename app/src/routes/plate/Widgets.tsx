// The plate's foot: small squares, one fact and one large value each, for whoever checks rather than discovers; a square with detail opens in
// place (its Expand button) over the whole row. Four a row on a wide plate, two on a narrow one.
import { useState } from "react";
import { Avatar, Card, Cell, Cluster, Grid, Stack } from "@gnoworld/ui";
import type { Widget } from "./model.ts";
import styles from "./Widgets.module.css";

function Square({ widget, open, onToggle }: { widget: Widget; open: boolean; onToggle: () => void }) {
  const { label, value, unit, face, detail, more } = widget;
  return (
    <Card look="hub" rises>
      <Card.Header
        title={label}
        level={3}
        {...(more === undefined ? {} : { expand: { open, onToggle, small: true } })}
      />
      <Stack space="s">
        <Cluster align="center" wrap="no" space="2xs">
          {face === undefined ? null : <Avatar address={face} name={value} size="m" decorative />}
          <span className={["truncate", styles["value"]].join(" ")} dir="ltr" title={value}>
            {value}
            {unit === undefined ? null : <small>{unit}</small>}
          </span>
        </Cluster>
        {detail === undefined ? null : <span className={styles["sub"]}>{detail}</span>}
      </Stack>
      {more === undefined ? null : (
        <div className={styles["fold"]} data-open={open ? "" : undefined} inert={!open}>
          <div className={styles["more"]}>
            <Stack as="ul" space="xs">
              {more.map((line) => (
                <li key={line} dir="ltr">
                  {line}
                </li>
              ))}
            </Stack>
          </div>
        </div>
      )}
    </Card>
  );
}

export function Widgets({ widgets }: { widgets: readonly Widget[] }) {
  const [open, setOpen] = useState<string>();
  if (widgets.length === 0) return null;
  return (
    <div className={styles["widgets"]}>
      <Grid cols={12} space="s">
        {widgets.map((widget) => {
          const shown = open === widget.label;
          return (
            <Cell key={widget.label} span={shown ? 12 : 3} {...(shown ? {} : { narrow: 6 as const })}>
              <Square
                widget={widget}
                open={shown}
                onToggle={() => {
                  setOpen(shown ? undefined : widget.label);
                }}
              />
            </Cell>
          );
        })}
      </Grid>
    </div>
  );
}
