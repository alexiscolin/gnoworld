// The header's two pills (D424, D444): where one is, the three levels of space, System and World each named by the place it leads to (the
// page's own, else the last this tab saw, the Earth's home the first time), and the chat full (?chat=full) of that world beside it; and
// how one looks at it: space or the Map (space from above).
import { realmName } from "@gnoworld/core";
import { Icon, type IconName } from "@gnoworld/ui";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useDrawnPath } from "./drawnPath.ts";
import { isHome, systemOfPage, systemPath, trimmed } from "./cosmosAt.ts";
import { asksFull, fullChatHref, holdsChat, leaveDock } from "./fullChat.ts";
import { useViewKeys } from "./features/universe/viewKeys.ts";
import { isMap, showMap, useMapView } from "./mapView.ts";
import { nameOf } from "./placeName.ts";
import { placeOf, site, universePath, type UniverseView, type View } from "./places.ts";
import styles from "./shellHeader.module.css";

/** A place a level leads to: its page and its name. */
export interface Spot {
  readonly path: string;
  readonly name: string;
}

/** A level of the views' pill: what it is, the place it leads to, what it holds for a screen reader. */
export interface Level {
  readonly view: View;
  readonly label: string;
  readonly name?: string;
  readonly path: string;
  readonly holds: string;
}

// What this tab saw last, written once a page shows; the server, which renders for every reader, keeps none.
const seen: { system?: Spot; world?: Spot } = {};
// The world the page at `pathname` is: the Earth, a hub's world by its name, a realm by its last part.
function worldAt(universe: UniverseView, pathname: string): Spot | undefined {
  if (!holdsChat(pathname)) return undefined;
  const path = trimmed(pathname);
  if (path === universe.earth.path || path === universe.earth.canonical) return { path, name: "Earth" };
  const slug = /\/w\/([^/]+)/.exec(path)?.[1];
  if (slug !== undefined) return { path, name: placeOf(universe, slug)?.name ?? slug };
  // A realm by core's name for it, its last part with its version left out (gnoswap/access/v1 is "access"); any other path by itself.
  return { path, name: /\/r\/./.test(path) ? realmName(path).name : path };
}

// The system the page at `pathname` stands in, a system's or a world's; none far out.
function systemAt(universe: UniverseView, pathname: string): Spot | undefined {
  const view = site.viewAt(universe, pathname);
  if (view !== "system" && view !== "world") return undefined;
  const round = systemOfPage(pathname);
  const path = universe.isDefault ? systemPath(round) : universe.home.path;
  return { path, name: round === undefined || isHome(round) ? "gno.land" : nameOf(round) };
}

/** The views' pill from the page at `pathname`: Galaxy, then its system and its world, else the last seen, else the Earth's; and that
 * world, which the chat opens from a page that holds none. */
export function levelsOf(universe: UniverseView, pathname: string): { levels: Level[]; world: Spot } {
  // None seen yet, the Earth's system: its own page, `/s/gnoland`, never the home's first screen (D501).
  const home = { path: universe.isDefault ? systemPath(undefined) : universe.home.path, name: "gno.land" };
  const system = systemAt(universe, pathname) ?? seen.system ?? home;
  const world = worldAt(universe, pathname) ?? seen.world ?? { path: universe.earth.path, name: "Earth" };
  const levels: Level[] = [
    { view: "universe", label: "Galaxy", path: universePath(universe), holds: "every system, as a star" },
    { view: "system", label: "System", ...system, holds: `the worlds of ${system.name} round its sun` },
    { view: "world", label: "World", ...world, holds: `${world.name}: its page and its chat` },
  ];
  return { levels, world };
}

/** Keeps the system and the world of the page in view as the last this tab saw. */
export function useSeenPlaces(universe: UniverseView, pathname: string): void {
  useEffect(() => {
    const system = systemAt(universe, pathname);
    const world = worldAt(universe, pathname);
    if (system !== undefined) seen.system = system;
    if (world !== undefined) seen.world = world;
  }, [universe, pathname]);
}

// One way to look: a link where it leaves the full chat or opens it, else a button pressed in place.
function Way(props: {
  icon: IconName;
  label: string;
  /** Its name for a screen reader, its word first (WCAG 2.5.3). */
  name?: string;
  on: boolean;
  to?: string | undefined;
  pick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  off?: boolean;
}) {
  const { icon, label, name = label, on, to, pick, off = false } = props;
  const body: ReactNode = (
    <>
      <Icon name={icon} />
      <span className={styles["word"]}>{label}</span>
    </>
  );
  return to === undefined ? (
    <button
      type="button"
      className={`no-edge tint caps ${String(styles["view"])}`}
      aria-label={name}
      aria-pressed={on}
      disabled={off}
      onClick={pick}
    >
      {body}
    </button>
  ) : (
    <Link
      to={to}
      className={`no-edge tint caps ${String(styles["view"])}`}
      aria-current={on ? "page" : undefined}
      aria-label={name}
      onClick={pick}
    >
      {body}
    </Link>
  );
}

// The full chat of the page at `href` where it holds one, else of `world`.
const chatOf = (href: string, world: Spot) => fullChatHref(holdsChat(href.split("?")[0] ?? href) ? href : world.path);

/** The chat full of the page in view, else of the world the World level leads to (D444): beside that level, after a divider, and in the
 * cream while it is open. A page with a chat under the dock's width is its chat already: none there. */
export function ChatWay({ world }: { world: Spot }) {
  const pathname = useDrawnPath();
  const { search } = useLocation();
  const full = asksFull(new URLSearchParams(search));
  return (
    <span className={styles["chatWay"]} data-chat-page={holdsChat(pathname) ? "" : undefined}>
      <span className={styles["divider"]} aria-hidden="true" />
      {/* The full chat grows out of the dock, as from the chat's own Expand. */}
      <Way
        icon="chat"
        label="Chat"
        name={`Chat of ${world.name}`}
        on={full}
        to={chatOf(`${pathname}${search}`, world)}
        pick={
          full
            ? undefined
            : (event) => {
                leaveDock(event.currentTarget);
              }
        }
      />
    </span>
  );
}

/** How one looks at the place in view (D424, D427): space, or space flat (the Map). `world`: the page is a world's, which has no Map yet
 * (Alexis, 2026-11-09): none there, nor in the full chat, a Map asked on the way in left. */
export function Ways({ world }: { world: boolean }) {
  const { search } = useLocation();
  const away = world || asksFull(new URLSearchParams(search));
  const map = useMapView();
  useViewKeys(!away);
  useEffect(() => {
    if (world && isMap()) showMap(false);
  }, [world]);
  return (
    <nav
      aria-label="How you look"
      className={`${styles["ways"] ?? ""} control-bar`}
      data-away={away ? "" : undefined}
      aria-hidden={away ? true : undefined}
      inert={away}
    >
      <Way
        icon="planet"
        label="Space"
        on={!map}
        pick={() => {
          showMap(false);
        }}
      />
      <Way
        icon="map"
        label="Map"
        on={map}
        pick={() => {
          showMap(true);
        }}
      />
    </nav>
  );
}
