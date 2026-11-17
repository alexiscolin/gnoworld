// A phone's main navigation, at the bottom of its chat: the worlds in one row that scrolls sideways inside itself, each its planet with its
// name under it and its unseen lines at its corner; the world in view ringed and brought into view when the row is drawn. The row is the
// desktop column's (the Earth, the worlds followed, then the chat's own, Worlds.tsx), then, read after the first paint, the desktop rail's
// worlds the column lacks (railFeed, RailOrder), and begins with "All", which asks the search palette open on every place, as the rail's does.
import { EARTH, hubWorldOf } from "@gnoworld/core";
import { Icon } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import type { RailEntry } from "../../railWorlds.ts";
import { RouterLink } from "../../routerLink.tsx";
import { SEARCH } from "../../space/openEvent.ts";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import { UnreadPill } from "./UnreadPill.tsx";
import styles from "./PhoneWorlds.module.css";
import column from "./Worlds.module.css";
import { inRailOrder, NONE, type WorldsProps } from "./Worlds.tsx";

// The rail's feed and order, in chunks of their own: out of the component, where the React Compiler takes no import().
const railModules = () => Promise.all([import("../../railFeed.ts"), import("../../railWorlds.ts")]);

interface Item {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  /** Its unseen lines: none for the world in view, whose own rooms carry theirs. */
  readonly unseen: number;
  /** A seed is uncharted: its disc, no planet. */
  readonly seed?: true;
}

/** The id of the world in view: its hub's world, else the slug itself (a realm's world the chat lists not). */
const hereOf = (worlds: WorldsProps["worlds"], current: string): string => {
  const hub = worlds.find(({ slug }) => slug === current);
  return hub === undefined ? current : hubWorldOf(hub);
};

/** The row's worlds: the desktop column's, in its order (the Earth, the worlds followed, the rest), each with its unseen lines; then the
 * rail's worlds, once read, that the column does not hold. Each once. */
export function rowOf(
  { worlds, current, followed = NONE, unread }: Pick<WorldsProps, "worlds" | "current" | "followed" | "unread">,
  rail: readonly RailEntry[] | undefined,
): Item[] {
  const hubs: Item[] = inRailOrder(worlds, followed).map((world) => ({
    id: hubWorldOf(world),
    name: world.name,
    href: world.href,
    unseen: world.slug === current ? 0 : (unread?.[world.slug] ?? 0),
  }));
  const held = new Set(hubs.map(({ id }) => id));
  const more: Item[] = (rail ?? []).flatMap(({ id, title, href, section }) =>
    held.has(id) ? [] : [{ id, name: title, href, unseen: 0, ...(section === "seed" ? { seed: true as const } : {}) }],
  );
  return [...hubs, ...more];
}

/** The desktop rail's worlds, none till they are read: the code and the file come after the first paint, never with the chat. */
function useRail(worlds: WorldsProps["worlds"]): readonly RailEntry[] | undefined {
  const [entries, setEntries] = useState<readonly RailEntry[]>();
  const [places] = useState(() => ({
    earth: worlds.find(({ slug }) => slug === EARTH)?.href ?? "/earth",
    worlds: worlds.filter(({ slug }) => slug !== EARTH).map(({ slug, href, realms }) => ({ slug, path: href, realms })),
  }));
  useEffect(() => {
    const leaving = new AbortController();
    const stops: (() => void)[] = [];
    railModules().then(
      ([{ data, feed, subscribe }, { RailOrder }]) => {
        if (leaving.signal.aborted) return;
        const order = new RailOrder(places);
        const read = () => {
          const known = data();
          if (known !== undefined) order.read(known);
        };
        stops.push(
          order.subscribe(() => {
            setEntries(order.entries());
          }),
          subscribe(read),
          () => {
            order.dispose();
          },
        );
        read();
        feed(leaving.signal);
      },
      () => undefined,
    );
    return () => {
      leaving.abort();
      for (const stop of stops) stop();
    };
  }, [places]);
  return entries !== undefined && entries.length > 0 ? entries : undefined;
}

/** "All": asks the search palette open on every place, as the desktop rail's does. */
function AllPlaces() {
  return (
    <button
      type="button"
      className={`${column["world"] ?? ""} ${styles["link"] ?? ""} no-edge`}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(SEARCH, { detail: "" }));
      }}
    >
      <span className={`${styles["disc"] ?? ""} ${styles["all"] ?? ""} grid-center`}>
        <Icon name="orbits" size="l" />
      </span>
      <span className={`${styles["name"] ?? ""} label`}>
        All<span className="visually-hidden"> places</span>
      </span>
    </button>
  );
}

export function PhoneWorlds(props: WorldsProps) {
  const rowRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { worlds, current } = props;
  const items = rowOf(props, useRail(worlds));
  const here = hereOf(worlds, current);
  // The row's attributes tell whether more lies before (data-from) and after (data-to) what is in view: the fades and the cue follow.
  // Read from the layout on a scroll and on a resize, and again as worlds come (the count), never held in state.
  const count = items.length;
  useEffect(() => {
    const box = scrollerRef.current;
    const host = rowRef.current;
    if (box === null || host === null) return;
    const read = () => {
      const left = Math.abs(box.scrollLeft);
      host.dataset["from"] = String(left > 1);
      host.dataset["to"] = String(left + box.clientWidth < box.scrollWidth - 1);
    };
    read();
    box.addEventListener("scroll", read, { passive: true });
    const watching = new ResizeObserver(read);
    watching.observe(box);
    return () => {
      box.removeEventListener("scroll", read);
      watching.disconnect();
    };
  }, [count]);
  useEffect(() => {
    // Sideways only: the page itself never moves. The row's own scroll-behavior (CSS) is auto under reduced motion.
    rowRef.current?.querySelector("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [here]);
  return (
    <nav ref={rowRef} aria-label="Worlds" className={styles["row"]}>
      <div ref={scrollerRef} data-scroller="" className={styles["scroller"]}>
        <ul className={styles["list"]}>
          <li>
            <AllPlaces />
          </li>
          {items.map((item) => (
            <li key={item.id}>
              <RouterLink
                href={item.href}
                aria-label={item.unseen > 0 ? `${item.name}, ${String(item.unseen)} unseen` : undefined}
                aria-current={item.id === here ? "page" : undefined}
                className={`${column["world"] ?? ""} ${styles["link"] ?? ""} no-edge`}
              >
                <span className={styles["disc"]}>
                  <span className={column["planet"]}>
                    <WorldPlanet
                      world={item.seed === true ? "" : item.id}
                      fallback=""
                      name={item.name}
                      kind={item.seed === true ? "signal" : "world"}
                      decorative
                    />
                  </span>
                  <span aria-hidden="true">
                    <UnreadPill count={item.unseen} />
                  </span>
                </span>
                <span className={`${styles["name"] ?? ""} label truncate`}>{item.name}</span>
              </RouterLink>
            </li>
          ))}
        </ul>
      </div>
      <span aria-hidden="true" className={styles["cue"]}>
        <Icon name="chevron" size="s" />
      </span>
    </nav>
  );
}
