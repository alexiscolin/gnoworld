// A realm's card and the pages of cards: Today's rows with their "See all", and a shelf's grid. A card is a button that opens the realm's
// detail; the arrows move among the cards.
import { STYLES, type ShelfId, type StoreRow, type TodayRow } from "@gnoworld/core";
import { shortAddress } from "@gnoworld/schemas";
import { EmptyState, Grid as Columns, Sidebar, Stack } from "@gnoworld/ui";
import type { KeyboardEvent } from "react";
import { WorldPlanet } from "../../../WorldPlanet.tsx";
import styles from "./Discover.module.css";
import { discOf } from "./planet.ts";
import { nameOfShelf } from "./Shelves.tsx";
import type { Discovery } from "./useDiscover.ts";

const LABELS = new Map<string, string>(STYLES.map(({ id, label }) => [id, label]));
/** A shelf draws this many cards; the rest asks for a style or a filter. */
const GRID_MAX = 60;

const short = (namespace: string) => (/^g1[0-9a-z]{38}$/.test(namespace) ? shortAddress(namespace) : namespace);
export const shortOf = short;

// One owner often deploys the same names in several worlds (`sinopia/market`, `minhwa/market`): the card names the world it is in, and an
// older version says which.
const worldPart = ({ world, namespace }: StoreRow) =>
  world !== namespace && world.startsWith(`${namespace}/`) ? world.slice(namespace.length + 1) : null;
const titleOf = ({ name, head, path }: StoreRow) => {
  const version = /[/_](v\d+)$/i.exec(path)?.[1];
  return head || version === undefined ? name : `${name} ${version}`;
};

/** The world's planet, its look's disc till it comes. */
export function Planet({ world, size }: { world: string; size: "s" | "l" }) {
  return <WorldPlanet world={world} fallback={discOf(world)} name={world} size={size} decorative />;
}

// What a card says last, and no more than the file gives.
function signal(row: StoreRow, here: number): string {
  if (here > 0) return `${String(here)} here`;
  if (row.recent) return "Recently active";
  return row.calls > 0 ? `${String(row.calls)} calls` : "";
}

function Card({ row, discovery }: { row: StoreRow; discovery: Discovery }) {
  const here = discovery.ground.here(row);
  const part = worldPart(row);
  // One style and one signal: a card's last line stays one line, the cards of a row one height.
  const tags = row.styles.filter((style) => style !== "lab").slice(0, 1);
  return (
    <button
      type="button"
      data-card=""
      aria-current={discovery.picked?.id === row.id || undefined}
      data-unseen={row.calls === 0 ? "" : undefined}
      className={["fill-hover", styles["card"]].join(" ")}
      onClick={() => {
        discovery.choose(row);
      }}
    >
      <Stack space="2xs">
        <Sidebar side="start" space="2xs">
          <Planet world={row.world} size="s" />
          <Stack space="3xs">
            <span className={["truncate", styles["name"]].join(" ")}>{titleOf(row)}</span>
            <span className={["truncate", styles["sub"]].join(" ")}>
              {part === null ? "" : `${part} · `}@{short(row.namespace)}
              {row.author === null ? "" : ` · ${row.author}`}
            </span>
          </Stack>
        </Sidebar>
        <span className={["tag-line", styles["meta"]].join(" ")}>
          {row.fresh ? <span className={styles["new"]}>new</span> : null}
          {tags.map((style) => (
            <span key={style} className={styles["tag"]}>
              {LABELS.get(style)}
            </span>
          ))}
          <span className={["truncate", here > 0 ? styles["here"] : styles["quiet"]].join(" ")}>
            {signal(row, here)}
          </span>
        </span>
      </Stack>
    </button>
  );
}

// The arrows go from card to card in the page's order, and Home and End to the ends.
export function moveAmongCards(event: KeyboardEvent<HTMLElement>): void {
  const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-card]")];
  const at = cards.indexOf(event.target as HTMLElement);
  const to = {
    ArrowRight: at + 1,
    ArrowDown: at + 1,
    ArrowLeft: at - 1,
    ArrowUp: at - 1,
    Home: 0,
    End: cards.length - 1,
  }[event.key];
  if (at === -1 || to === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  cards[Math.min(cards.length - 1, Math.max(0, to))]?.focus();
}

export function TodayRows({ rows, discovery }: { rows: readonly TodayRow[]; discovery: Discovery }) {
  // The rows breathe a large step apart, a row's title a small one above its cards.
  return (
    <Stack space="l">
      {rows.map((row) => (
        <section key={row.id} aria-label={row.title}>
          <Stack space="xs">
            <div className={styles["rowHead"]}>
              <h3>{row.title}</h3>
              <span className={styles["why"]}>{row.why}</span>
              {row.shelf === undefined ? null : <SeeAll shelf={row.shelf} show={discovery.show} />}
            </div>
            <div className={styles["strip"]}>
              {row.rows.map((each) => (
                <Card key={each.id} row={each} discovery={discovery} />
              ))}
            </div>
          </Stack>
        </section>
      ))}
    </Stack>
  );
}

function SeeAll({ shelf, show }: { shelf: ShelfId; show: (id: ShelfId) => void }) {
  return (
    <button
      type="button"
      className={styles["all"]}
      onClick={() => {
        show(shelf);
      }}
    >
      See all<span className="visually-hidden"> {nameOfShelf(shelf)}</span> →
    </button>
  );
}

export function Grid({ rows, discovery }: { rows: readonly StoreRow[]; discovery: Discovery }) {
  return (
    <>
      <Stack space="xs">
        <div className={styles["rowHead"]}>
          <h3>{nameOfShelf(discovery.shelf)}</h3>
          <span className={styles["why"]} role="status">{`${String(rows.length)} realms`}</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState look="inline" line="Nothing here with these filters. Clear one of them." />
        ) : (
          <Columns min="s" space="s">
            {rows.slice(0, GRID_MAX).map((row) => (
              <Card key={row.id} row={row} discovery={discovery} />
            ))}
          </Columns>
        )}
      </Stack>
      {rows.length > GRID_MAX ? (
        <p className={styles["why"]}>{`${String(rows.length - GRID_MAX)} more · refine with a style or a filter`}</p>
      ) : null}
    </>
  );
}
