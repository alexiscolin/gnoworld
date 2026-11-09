// A realm's detail, at the right: its planet, styles, path, author, callers, calls and who is here, then Fly there, Chat and Follow, and three
// next stops. Its words are read out as it changes.
import { nextStops, STYLES, type StoreRow } from "@gnoworld/core";
import { Button, Cluster, IconButton, Kicker, Stack } from "@gnoworld/ui";
import { Fragment } from "react";
import { FollowButton } from "../../follow/index.ts";
import { Planet, shortOf } from "./Cards.tsx";
import styles from "./Discover.module.css";
import { followKey } from "./realms.ts";
import type { Discovery } from "./useDiscover.ts";

const LABELS = new Map<string, string>(STYLES.map(({ id, label }) => [id, label]));
const stylesOf = (row: StoreRow) => row.styles.filter((style) => style !== "lab").map((style) => LABELS.get(style));

function Stops({ row, discovery }: { row: StoreRow; discovery: Discovery }) {
  const stops = nextStops(discovery.store, row);
  if (stops.length === 0) return null;
  return (
    <Stack space="xs">
      <Kicker>Next stops</Kicker>
      <Stack as="ul" space="2xs">
        {stops.map(({ row: stop, why }) => (
          <li key={stop.id}>
            <button
              type="button"
              data-card=""
              className={["fill-hover", styles["stop"]].join(" ")}
              onClick={() => {
                discovery.choose(stop);
              }}
            >
              <Cluster space="2xs">
                <Planet world={stop.world} size="s" />
                <Stack space="3xs">
                  <span className={styles["name"]}>{stop.name}</span>
                  <span className={styles["sub"]}>
                    {why === "author" ? "same author" : "same style"} · {stop.callers} callers
                  </span>
                </Stack>
              </Cluster>
            </button>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function Stats({ row, here }: { row: StoreRow; here: number }) {
  const figures = [
    ["callers", row.callers],
    ["calls", row.calls],
    ["here now", here],
  ] as const;
  return (
    <dl className={styles["stats"]}>
      {figures.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Detail({
  row,
  discovery,
  universe,
  fly,
  chat,
}: {
  row: StoreRow;
  discovery: Discovery;
  universe: string;
  fly: (row: StoreRow) => void;
  chat: (row: StoreRow) => void;
}) {
  const here = discovery.ground.here(row);
  const kind = stylesOf(row).join(" · ") || "Realm";
  return (
    <section key={row.id} className={styles["detail"]} aria-label="Realm detail">
      {/* Four groups a larger step apart (Alexis, 2026-11-08: "trop collé"): who it is, its figures, what to do, where next. */}
      <Stack space="l">
        <p className="visually-hidden" role="status">
          {`${row.name}, ${kind}, ${String(row.callers)} callers, ${String(row.calls)} calls, ${String(here)} here now`}
        </p>
        <Stack space="xs">
          <div className={styles["detailHead"]}>
            <Planet world={row.world} size="l" />
            <IconButton
              icon="close"
              label="Close detail"
              size="s"
              onClick={() => {
                discovery.choose(undefined);
              }}
            />
          </div>
          <Kicker>{kind}</Kicker>
          <h3>{row.name}</h3>
          {/* A long path may break after each "/", and a copy of it holds no character the eye does not see. */}
          <p className={styles["path"]}>
            {row.path.split("/").map((part, at) => (
              <Fragment key={`${String(at)}:${part}`}>
                {at === 0 ? null : (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </Fragment>
            ))}
          </p>
          <p className={styles["note"]}>
            {row.page ? "It has a page of its own, and its functions." : "No page of its own: its functions."}
            {row.author === null ? ` By @${shortOf(row.namespace)}.` : ` By ${row.author}.`}
          </p>
        </Stack>
        <Stats row={row} here={here} />
        <Cluster space="2xs">
          <Button
            emphasis="solid"
            icon="arrow"
            onClick={() => {
              fly(row);
            }}
          >
            Fly there
          </Button>
          <Button
            icon="chat"
            onClick={() => {
              chat(row);
            }}
          >
            Chat
          </Button>
          <FollowButton kind="worlds" id={followKey(row, universe)} size="m" />
        </Cluster>
        <Stops row={row} discovery={discovery} />
      </Stack>
    </section>
  );
}
