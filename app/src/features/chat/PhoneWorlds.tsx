// A phone's main navigation, at the bottom of its chat: the worlds in one row that scrolls sideways inside itself, each its planet with its
// name under it; the world in view ringed and brought into view when the row is drawn. The row first holds the chat's own worlds (the hubs),
// then, read after the first paint, the desktop rail's worlds in the rail's order (railFeed, RailOrder), the Earth and the world in view first,
// and ends with "See all", which asks the search palette open on every place, as the rail's does.
import { EARTH, hubWorldOf } from "@gnoworld/core";
import { Button, Cluster } from "@gnoworld/ui";
import { useEffect, useRef, useState } from "react";
import type { RailEntry } from "../../railWorlds.ts";
import { RouterLink } from "../../routerLink.tsx";
import { SEARCH } from "../../space/openEvent.ts";
import { WorldPlanet } from "../../WorldPlanet.tsx";
import type { ChatWorld } from "./place.ts";
import styles from "./PhoneWorlds.module.css";
import column from "./Worlds.module.css";

interface Item {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  /** A seed is uncharted: its disc, no planet. */
  readonly seed?: true;
}

const hubItem = (world: ChatWorld): Item => ({ id: hubWorldOf(world), name: world.name, href: world.href });

/** The id of the world in view: its hub's world, else the slug itself (a realm's world the chat lists not). */
const hereOf = (worlds: readonly ChatWorld[], current: string): string => {
  const hub = worlds.find(({ slug }) => slug === current);
  return hub === undefined ? current : hubWorldOf(hub);
};

/** The row's worlds: the Earth, the world in view, then the rest in the order given, each once. `rail`, the desktop rail's worlds once
 * read, replaces the hubs but for the two firsts, whose names and links the chat knows. */
export function rowOf(worlds: readonly ChatWorld[], current: string, rail: readonly RailEntry[] | undefined): Item[] {
  const hubs = worlds.map(hubItem);
  const rest: Item[] =
    rail?.map(({ id, title, href, section }) => ({
      id,
      name: title,
      href,
      ...(section === "seed" ? { seed: true as const } : {}),
    })) ?? hubs;
  const first = new Map<string, Item>();
  for (const id of [EARTH, hereOf(worlds, current)]) {
    const item = hubs.find((hub) => hub.id === id) ?? rest.find((each) => each.id === id);
    if (item !== undefined) first.set(id, item);
  }
  return [...first.values(), ...rest.filter(({ id }) => !first.has(id))];
}

/** The desktop rail's worlds, none till they are read: the code and the file come after the first paint, never with the chat. */
function useRail(worlds: readonly ChatWorld[]): readonly RailEntry[] | undefined {
  const [entries, setEntries] = useState<readonly RailEntry[]>();
  const [places] = useState(() => ({
    earth: worlds.find(({ slug }) => slug === EARTH)?.href ?? "/earth",
    worlds: worlds.filter(({ slug }) => slug !== EARTH).map(({ slug, href, realms }) => ({ slug, path: href, realms })),
  }));
  useEffect(() => {
    const leaving = new AbortController();
    const stops: (() => void)[] = [];
    Promise.all([import("../../railFeed.ts"), import("../../railWorlds.ts")]).then(
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

export function PhoneWorlds({ worlds, current }: { worlds: readonly ChatWorld[]; current: string }) {
  const rowRef = useRef<HTMLElement>(null);
  const items = rowOf(worlds, current, useRail(worlds));
  const here = hereOf(worlds, current);
  useEffect(() => {
    // Sideways only: the page itself never moves. The row's own scroll-behavior (CSS) is auto under reduced motion.
    rowRef.current?.querySelector("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);
  return (
    <nav ref={rowRef} aria-label="Worlds" className={styles["row"]}>
      <Cluster as="ul" space="2xs" wrap="no" className={styles["list"]}>
        {items.map((item) => (
          <li key={item.id}>
            <RouterLink
              href={item.href}
              aria-current={item.id === here ? "page" : undefined}
              className={`${column["world"] ?? ""} ${styles["link"] ?? ""}`}
            >
              <span className={column["planet"]}>
                <WorldPlanet
                  world={item.seed === true ? "" : item.id}
                  fallback=""
                  name={item.name}
                  kind={item.seed === true ? "signal" : "world"}
                  decorative
                />
              </span>
              <span className={`${styles["name"] ?? ""} truncate`}>{item.name}</span>
            </RouterLink>
          </li>
        ))}
        <li>
          <Button
            onClick={() => {
              window.dispatchEvent(new CustomEvent(SEARCH, { detail: "" }));
            }}
          >
            See all<span className="visually-hidden"> places</span>
          </Button>
        </li>
      </Cluster>
    </nav>
  );
}
