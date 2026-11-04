// The rail (frames 4 and 16; ADR-0002 §1's rail and §10; 7i): the Earth and the worlds of the moment down the right edge, each its planet and
// its name, 25 at most, then See all; one stop in the tab order, the arrows among the worlds; each planet its own portrait once the scene
// drew it, ui's drawn disc till then. Where it stands, the page's plain list of worlds steps aside: the rail stands for it.
import { RAIL } from "@gnoworld/core";
import { PlanetThumb } from "@gnoworld/ui";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { followed } from "../../lib/followed.ts";
import { worldsFollowedIn } from "../follow/index.ts";
import { nextLine } from "../../lib/nextLine.ts";
import { dock } from "./railDock.ts";
import { RailOrder, type RailPlaces } from "./railWorlds.ts";
import type { CosmosPage, Known, Portraits } from "./worldsFeed.ts";
import styles from "./Rail.module.css";

/** A portrait's side, in the page's pixels: a 64 px planet as the dock magnifies it. */
export const PORTRAIT_SIZE = 100;
const EVERY_PLACE = "/list";
// The rail's footprint, which the labels keep clear (core's RAIL): its width comes from it.
const FOOTPRINT = { "--_footprint": `${String(RAIL.footprint)}px` } as CSSProperties;

/** What the rail reads: the worlds and what is known of them, and the scene's portraits of their planets, which outlive the rail. */
export interface RailSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly data: () => Known | undefined;
  readonly portraits: Pick<Portraits, "subscribe" | "drawn" | "ask">;
}

// The page's plain list of worlds (Hero.tsx), marked while the rail stands for it.
function standFor(standing: boolean): void {
  const list = document.querySelector<HTMLElement>("[data-rail]");
  if (list !== null) list.dataset["rail"] = standing ? "standing" : "none";
}

// The rail holds its order while the reader is on it: the pointer over it, or the focus in it.
function holdWhileOn(rail: HTMLElement, order: RailOrder, signal: AbortSignal): void {
  const on = { pointer: false, focus: false };
  const told = (change: Partial<typeof on>) => {
    Object.assign(on, change);
    order.hold(on.pointer || on.focus);
  };
  const listening = { signal };
  rail.addEventListener(
    "pointerenter",
    () => {
      told({ pointer: true });
    },
    listening,
  );
  rail.addEventListener(
    "pointerleave",
    () => {
      told({ pointer: false });
    },
    listening,
  );
  rail.addEventListener(
    "focusin",
    () => {
      told({ focus: true });
    },
    listening,
  );
  rail.addEventListener(
    "focusout",
    ({ relatedTarget }) => {
      told({ focus: relatedTarget instanceof Node && rail.contains(relatedTarget) });
    },
    listening,
  );
}

// The rail's order and portraits from its source, and while it stands: the page's list stepping aside, the hold, the dock and the cut.
function useRail(source: RailSource, places: RailPlaces, followed: readonly string[]) {
  const [order] = useState(() => new RailOrder(places));
  useEffect(() => {
    order.follow(followed);
  }, [order, followed]);
  const known = useSyncExternalStore(source.subscribe, source.data);
  const entries = useSyncExternalStore(order.subscribe, order.entries);
  const drawn = useSyncExternalStore(source.portraits.subscribe, source.portraits.drawn);
  const railRef = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);
  // A rail of the Earth alone stands not, and leaves the page its list of hubs (Alexis, 2026-11-03).
  const standing = known !== undefined && entries.some(({ section }) => section !== "earth");
  useEffect(() => {
    if (known !== undefined) order.read(known);
  }, [order, known]);
  useEffect(
    () => () => {
      order.dispose();
    },
    [order],
  );
  useEffect(() => {
    // A seed shows no portrait: it is unknown till charted.
    const ids = entries.filter(({ section }) => section !== "seed").map(({ id }) => id);
    source.portraits.ask(ids, PORTRAIT_SIZE);
  }, [source, entries]);
  useEffect(() => {
    const rail = railRef.current;
    const leaving = new AbortController();
    standFor(standing);
    if (standing && rail !== null) {
      holdWhileOn(rail, order, leaving.signal);
      const list = rail.querySelector("ul");
      if (list !== null) dock(list, leaving.signal, setCut);
    }
    return () => {
      leaving.abort();
      standFor(false);
    };
  }, [standing, order]);
  return { entries: standing ? entries : [], drawn, railRef, cut };
}

const NONE: readonly string[] = [];
const unchanging = () => () => undefined;

// The worlds the reader follows, by their ids, the last followed first, as the page's store holds them; none where the page gives none.
function useFollowed(follows: CosmosPage["follows"]): readonly string[] {
  const held = useSyncExternalStore(
    follows?.store.subscribe ?? unchanging,
    () => follows?.store.getState().device.follows,
  );
  return held === undefined || follows === undefined ? NONE : worldsFollowedIn(held, follows.universe);
}

export function Rail({
  source,
  places,
  open,
  follows,
}: {
  source: RailSource;
  places: RailPlaces;
  open: (href: string) => void;
  /** Where the worlds the reader follows are read: they come after the Earth. */
  follows?: CosmosPage["follows"];
}) {
  const { entries, drawn, railRef, cut } = useRail(source, places, useFollowed(follows));
  const [stop, setStop] = useState(0);
  if (entries.length === 0) return null;
  const moved = (event: KeyboardEvent<HTMLUListElement>) => {
    const links = [...event.currentTarget.querySelectorAll("li > a")];
    const to = nextLine(event, links.length, () => links.findIndex((link) => link === event.target));
    const link = to === undefined ? undefined : links[to];
    if (to === undefined || !(link instanceof HTMLElement)) return;
    event.preventDefault();
    link.focus();
    setStop(to);
  };
  // The world last reached keeps the tab stop, or the first once the list is shorter than its place.
  const tabStop = stop < entries.length ? stop : 0;
  return (
    <nav aria-label="Worlds" className={styles["rail"]} style={FOOTPRINT} ref={railRef}>
      <div className={styles["column"]} data-cut={cut || undefined}>
        <ul className={styles["worlds"]} onKeyDown={moved}>
          {entries.map(({ id, title, section, href }, at) => (
            <li key={id}>
              <a
                href={href}
                className={styles["world"]}
                tabIndex={at === tabStop ? 0 : -1}
                onClick={(event) => {
                  followed(event, href, open);
                }}
                onFocus={() => {
                  setStop(at);
                }}
              >
                <PlanetThumb
                  src={drawn.get(id) ?? ""}
                  name={title}
                  kind={section === "seed" ? "signal" : "world"}
                  size="l"
                  decorative
                  magnify
                />
                <span className={["label", styles["name"]].join(" ")}>{title}</span>
              </a>
            </li>
          ))}
        </ul>
        <a
          href={EVERY_PLACE}
          className={["label", styles["all"]].join(" ")}
          onClick={(event) => {
            followed(event, EVERY_PLACE, open);
          }}
        >
          See all
        </a>
      </div>
    </nav>
  );
}
