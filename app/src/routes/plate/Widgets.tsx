// The plate's foot: small squares, one fact and one large value each, for whoever checks rather than discovers; a square with detail opens alone
// (its Expand button) over the whole pane. Four a row on a wide plate, two on a narrow one.
import { Avatar, Card, Cell, Cluster, Grid, Stack, useAlone } from "@gnoworld/ui";
import { PersonLink } from "../../features/chat/index.ts";
import type { Widget } from "./model.ts";
import styles from "./Widgets.module.css";
import { rowFill } from "./rowFill.ts";

function Square({ widget, expand }: { widget: Widget; expand: ReturnType<typeof useAlone> }) {
  const { label, value, unit, face, detail, more } = widget;
  const { open } = expand;
  return (
    <Card look="hub" rises open={open}>
      <Card.Header title={label} level={3} {...(more === undefined ? {} : { expand: { ...expand, small: true } })} />
      <Stack space="s">
        <Cluster align="center" wrap="no" space="2xs">
          {face === undefined ? null : (
            <PersonLink address={face}>
              <Avatar address={face} name={value} size="m" decorative />
            </PersonLink>
          )}
          <span className={["truncate", styles["value"]].join(" ")} dir="ltr" title={value}>
            {face === undefined ? value : <PersonLink address={face}>{value}</PersonLink>}
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

// A square's cell: its share of its row (rowFill.ts), all of it once it is open alone.
function Slot({ widget, fill }: { widget: Widget; fill: ReturnType<typeof rowFill> }) {
  const expand = useAlone(`square:${widget.label}`);
  return (
    <Cell span={expand.open ? 12 : fill.span} {...(expand.open || !fill.narrow ? {} : { narrow: 6 as const })}>
      <Square widget={widget} expand={expand} />
    </Cell>
  );
}

export function Widgets({ widgets }: { widgets: readonly Widget[] }) {
  if (widgets.length === 0) return null;
  return (
    <div className={styles["widgets"]}>
      <Grid cols={12} space="s">
        {widgets.map((widget, at) => (
          <Slot key={widget.label} widget={widget} fill={rowFill(at, widgets.length)} />
        ))}
      </Grid>
    </div>
  );
}
