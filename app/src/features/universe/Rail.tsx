// The rail (frames 4 and 16; ADR-0002 §1's rail and §10; 7i): the Earth and the worlds of the moment down the right edge, each its planet and
// its name, 25 at most, the column scrolling to its end, "See all" under it; one stop in the tab order, the arrows among the worlds; each
// planet its real one once drawn (WorldPlanet), ui's disc till then. Where it stands, the page's plain list of worlds steps aside for it.
import { Button } from "@gnoworld/ui";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { WorldPlaces } from "../../lib/hubWorld.ts";
import { nextLine } from "../../lib/nextLine.ts";
import { RouterLink } from "../../routerLink.tsx";
import { SEARCH } from "../../space/openEvent.ts";
import { useApp } from "../../storeContext.tsx";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { worldsFollowedIn } from "../follow/index.ts";
import { dock } from "./railDock.ts";
import { data, feed, subscribe } from "../../railFeed.ts";
import { keptRail, RailOrder, type RailEntry } from "../../railWorlds.ts";
import { useSwapped } from "../../swapped.ts";
import { sameKind } from "./useSpace.ts";
import { inSystem, useResting } from "./views.ts";
import { useLens, useLit } from "../../lenses.ts";
import { loading, RETURN_AFTER, riseIn } from "./rise.ts";
import styles from "./Rail.module.css";
import { FOOTPRINT } from "./railFootprint.ts";

const unknown = () => undefined;
const noEntries = () => NO_ENTRIES;
const NO_ENTRIES: readonly RailEntry[] = [];

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

// What a tag and a system keep of the rail's worlds; none far out with no tag.
function keepOf(only: ReadonlySet<string> | undefined, system: string | undefined) {
  if (only === undefined && system === undefined) return undefined;
  return (id: string) => (only?.has(id) ?? true) && (system === undefined || inSystem(id, system));
}

// Each universe's rail order, kept across the pages that show the rail: a page of the cosmos replacing another (the galaxy, the Earth's
// ecosystem) draws the worlds it had at once, never an empty rail that fills (sameKind).
const orders = new Map<string, RailOrder>();
function orderOf(universe: string, places: WorldPlaces): RailOrder {
  const order = orders.get(universe) ?? new RailOrder(places);
  orders.set(universe, order);
  return order;
}

// The rail's order from the feed, and while it stands: the feed asking, the page's list stepping aside, the hold, the dock and the cut.
function useRail(places: WorldPlaces, followed: readonly string[], universe: string) {
  const [order] = useState(() => orderOf(universe, places));
  useEffect(() => {
    order.follow(followed);
  }, [order, followed]);
  // The build's pre-render knows no world: the rail is drawn once the page runs.
  const known = useSyncExternalStore(subscribe, data, unknown);
  const entries = useSyncExternalStore(order.subscribe, order.entries, noEntries);
  const railRef = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);
  // A rail of the Earth alone stands not, and leaves the page its list of hubs (Alexis, 2026-11-03).
  const standing = known !== undefined && entries.some(({ section }) => section !== "earth");
  useEffect(() => {
    const leaving = new AbortController();
    feed(leaving.signal);
    return () => {
      leaving.abort();
      order.dispose();
    };
  }, [order]);
  useEffect(() => {
    if (known !== undefined) order.read(known);
  }, [order, known]);
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
  // A tag's rail (D425) and a system's (D428): the worlds they keep, in place of the rail's own; far out, the rail's own.
  const lens = useLens();
  const lit = useLit();
  const system = useResting();
  const only = lens === undefined ? undefined : lit?.sets.get(lens);
  const kept = keepOf(only, system);
  const shown = kept === undefined || known === undefined ? entries : keptRail(known, places, kept);
  return { entries: standing ? shown : NO_ENTRIES, railRef, cut, keep: `${lens ?? ""} ${system ?? ""}` };
}

const NONE: readonly string[] = [];

/** The rail of the universe `universe`, its links going to `places`. */
export function Rail({ places, universe }: { places: WorldPlaces; universe: string }) {
  // The worlds the reader follows, the last followed first, as one string React compares as it is.
  const key = useApp((state) => worldsFollowedIn(state.device.follows, universe).join("\n"));
  const followed = key === "" ? NONE : key.split("\n");
  const rail = useRail(places, followed, universe);
  const { railRef, cut } = rail;
  const columnRef = useRef<HTMLUListElement>(null);
  const entries = useSwapped(rail.keep, rail.entries, columnRef);
  const [stop, setStop] = useState(0);
  // The rail rises in with the hero as space comes back from a page; under the first load's loader it rises with the rest.
  const present = entries.length > 0;
  useEffect(() => {
    const rail = railRef.current;
    if (present && rail !== null && !loading() && !sameKind()) riseIn(rail.querySelectorAll("li"), RETURN_AFTER, true);
  }, [present, railRef]);
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
    <nav aria-label="Worlds" className={styles["rail"]} style={FOOTPRINT} ref={railRef} data-exit="">
      <div className={styles["column"]} data-cut={cut || undefined}>
        <ul className={styles["worlds"]} onKeyDown={moved} ref={columnRef}>
          {entries.map(({ id, title, section, href }, at) => (
            <li key={id}>
              <RouterLink
                href={href}
                className={styles["world"]}
                tabIndex={at === tabStop ? 0 : -1}
                onFocus={() => {
                  setStop(at);
                }}
              >
                {/* A seed shows its disc: it is unknown till charted. */}
                <WorldPlanet
                  world={section === "seed" ? "" : id}
                  fallback=""
                  name={title}
                  kind={section === "seed" ? "signal" : "world"}
                  size="l"
                  decorative
                  magnify
                />
                <span className={["label", styles["name"]].join(" ")}>{title}</span>
              </RouterLink>
            </li>
          ))}
        </ul>
      </div>
      {/* The rail shows the worlds of the moment; every place is the search palette's (D355), asked open on no words. */}
      <div className={styles["foot"]}>
        <Button
          size="s"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(SEARCH, { detail: "" }));
          }}
        >
          See all<span className="visually-hidden"> places</span>
        </Button>
      </div>
    </nav>
  );
}
