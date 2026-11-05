// The search as the video's drawer at the left (frames 98 to 100, 126, 127): the passport's block first, the worlds this device stamped out
// of those the reader's view lists on an arc, the uncharted signals still to find, Go explore (8b's choice) and the passport; then the field
// and the places by kind, each with its planet's colour and the people in it now. Sponsored satellites are slice 11's: a row says so. A
// chunk of its own, asked at the first opening: the first screen holds the header's button alone.
import { daysSince, EARTH, hubWorldOf, isFresh, passportCount, stampedIn, worldLook } from "@gnoworld/core";
import { Combobox, ComingSoon, Dialog, Kicker, Progress, type ComboboxGroup } from "@gnoworld/ui";
import type { PlaceKind } from "@gnoworld/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useDeviceView } from "../../deviceViews.ts";
import { pagePresenceApi } from "../../lib/api/presence.ts";
import { visitedIn } from "../../lib/visits.ts";
import { site, type UniverseView } from "../../places.ts";
import { useApp } from "../../storeContext.tsx";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useWorldsFile } from "../../worldsFile.ts";
import { GoExplore } from "../home/index.ts";
import { useWorldsCount } from "../universe/index.ts";
import { namespaceGroup, searchItemsOf, searchPlaces, type SearchGroup, type SearchItem } from "./search.ts";
import styles from "./SearchDrawer.module.css";

const KINDS: Record<PlaceKind, string> = {
  ecosystem: "Ecosystems",
  world: "Hubs and DAOs",
  earth: "Home",
  cosmos: "Universes",
};

const SATELLITES = "Sponsored satellites";
// The row slice 11 fills, its words its name too, so a screen reader hears what the eye reads.
const RENT = "Satellites anyone can rent";

// A place's dot in its planet's colour, its seed's middle hue as the far dot draws it; the Earth in its own blue, a universe in grey.
function Dot({ item }: { item: SearchItem }) {
  if (item.kind === "earth" || item.kind === "cosmos") return <span className={styles["dot"]} data-dot={item.kind} />;
  const listed = [...site.worlds, ...site.ecosystems].find(({ path }) => path === item.path);
  const seed = listed === undefined ? item.path : item.kind === "world" ? hubWorldOf(listed) : listed.slug;
  // Lifted till its brightest channel reaches 0.75, so a dark palette still reads as a colour on the drawer's night.
  const middle = worldLook(seed).ramp[1];
  const lift = Math.max(1, 0.75 / Math.max(...middle, 0.01));
  const [red, green, blue] = middle.map((channel) => Math.round(Math.min(1, channel * lift) * 255));
  return (
    <svg className={styles["dot"]} viewBox="0 0 10 10">
      <circle cx={5} cy={5} r={5} fill={`rgb(${String(red)} ${String(green)} ${String(blue)})`} />
    </svg>
  );
}

// Who is here in each of the default universe's worlds, by its roles file's slug, read as the drawer opens; nothing when the server says
// nothing.
function useHere(open: boolean): ReadonlyMap<string, number> {
  const [here, setHere] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    if (!open) return undefined;
    let shown = true;
    pagePresenceApi()
      .read()
      .then((read) => {
        if (shown && read.ok) setHere(new Map(read.value.worlds.map(({ world, here: people }) => [world, people])));
      })
      .catch(reportError);
    return () => {
      shown = false;
    };
  }, [open]);
  return here;
}

const defaultUniverse = site.universes.find((each) => each.isDefault)?.id;

// The count at a row's end: the people in a world or on the Earth of the default universe, whose rooms the server counts.
function hereOf(item: SearchItem, here: ReadonlyMap<string, number>): string | undefined {
  if (item.universe !== defaultUniverse) return undefined;
  const slug = item.kind === "earth" ? EARTH : item.kind === "world" ? item.path.split("/").at(-1) : undefined;
  const people = slug === undefined ? undefined : here.get(slug);
  return people === undefined ? undefined : String(people);
}

const optionsOf = (found: SearchGroup[], here: ReadonlyMap<string, number>): ComboboxGroup[] =>
  found.map((group) => ({
    id: group.kind,
    label: KINDS[group.kind],
    options: group.items.map((item) => {
      const trail = hereOf(item, here);
      return { id: item.path, label: item.name, lead: <Dot item={item} />, ...(trail === undefined ? {} : { trail }) };
    }),
  }));

// "3 / 19" on its arc, the signals left, Go explore and the passport (frame 99).
function Passport({
  universe,
  open,
  worlds,
  onPassport,
}: {
  universe: UniverseView;
  open: boolean;
  worlds: Worlds["worlds"] | undefined;
  onPassport: () => void;
}) {
  const stamped = useApp(({ device }) => stampedIn(device.stamps, universe.id).size);
  const count = passportCount(stamped, useWorldsCount(open) ?? undefined);
  const [now] = useState(Date.now);
  const visited = visitedIn(universe.id);
  const signals = worlds?.filter((world) => isFresh(daysSince(world.seen, now), visited(world.id))).length;
  return (
    <section className={styles["passport"]} aria-label="Your passport">
      <span className={styles["arc"]}>
        {count === undefined ? null : (
          <Progress kind="arc" label="Worlds you visited" value={count.stamped} max={count.listed} />
        )}
      </span>
      <div className={styles["words"]}>
        <Kicker>Worlds you visited</Kicker>
        <p className={styles["count"]}>
          <span className={styles["stamped"]}>{stamped}</span>
          {count === undefined ? null : <small className={styles["listed"]}> / {count.listed}</small>}
        </p>
        {signals === undefined ? null : (
          <p className={styles["signals"]}>
            {signals === 0
              ? "No signal left to find"
              : `${String(signals)} signal${signals === 1 ? "" : "s"} left to find`}
          </p>
        )}
        <GoExplore
          places={{ earth: universe.earth.path, worlds: universe.worlds, universe: universe.id }}
          className={styles["explore"]}
        />
        <button type="button" className={styles["open"]} onClick={onPassport}>
          Open your passport
        </button>
      </div>
    </section>
  );
}

export default function SearchDrawer({
  universe,
  open,
  onClose,
  start = "",
}: {
  universe: UniverseView;
  open: boolean;
  onClose: () => void;
  /** The words it opens on: a full Plan's namespace (F5462). */
  start?: string;
}) {
  const navigate = useNavigate();
  const [, openView] = useDeviceView();
  const [query, setQuery] = useState(start);
  // Each opening starts from its words: a closing cleared them, and the same ask again must find them.
  const [shown, setShown] = useState(open);
  if (open !== shown) {
    setShown(open);
    if (open) setQuery(start);
  }
  const [items] = useState(() => searchItemsOf(site));
  const here = useHere(open);
  // The worlds file the passport reads, read once for it and for a full Plan's namespace (F5470).
  const worlds = useWorldsFile(open && universe.isDefault);
  const close = () => {
    setQuery("");
    onClose();
  };
  const wanted = query.trim().toLowerCase();
  return (
    <Dialog title="Search" open={open} onClose={close} side="start">
      <div className={styles["drawer"]}>
        <Passport
          universe={universe}
          open={open}
          worlds={worlds}
          onPassport={() => {
            close();
            openView("passport");
          }}
        />
        <div className={styles["find"]}>
          {open ? (
            <Combobox
              label="Search places"
              placeholder="Where to? A hub, a topic, a #tag"
              clearable
              value={query}
              onValueChange={setQuery}
              groups={[...namespaceGroup(worlds, start, query), ...optionsOf(searchPlaces(items, query), here)]}
              onSelect={(path) => {
                close();
                Promise.resolve(navigate(path)).catch(reportError);
              }}
              footer={
                SATELLITES.toLowerCase().includes(wanted)
                  ? {
                      label: SATELLITES,
                      content: (
                        <ComingSoon name={RENT}>
                          <span className={styles["soonRow"]}>{RENT}</span>
                        </ComingSoon>
                      ),
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
