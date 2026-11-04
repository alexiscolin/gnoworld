// The passport (ADR-0002 §1, Passport; frame 99's "Worlds you visited 3/19"): the worlds this device stamped, by constellation, a star
// system each, its worlds counted once; the worlds charted here first; then today's expedition and the quests, which slice 8's other part
// fills (slots.ts). A wide dialog over the place; its code comes when it is first opened. Nothing of it leaves the device.
import {
  constellationsOf,
  type Constellation,
  EARTH,
  hubWorldOf,
  labelName,
  passportCount,
  stampedIn,
  stampKey,
} from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Dialog, Kicker, Progress, Row, Stack, Stat } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { readWorlds } from "../../lib/chain/realms.ts";
import { site } from "../../places.ts";
import { PassportSlot } from "../../slots.tsx";
import { useApp } from "../../storeContext.tsx";
import { useWorldsCount } from "../universe/index.ts";
import styles from "./Passport.module.css";

const DAY = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayOf = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`));

// A world's name as the reader knows it: a hub's own, the Earth's, else the one its id gives.
function namesOf(universe: string): (id: string) => string {
  const hubs = new Map(
    site.worlds.filter((world) => world.universe === universe).map((world) => [hubWorldOf(world), world.name]),
  );
  return (id) => hubs.get(id) ?? (id === EARTH ? "Earth" : (labelName(id) ?? id));
}

// The worlds' file, read once the dialog opens: the constellations need every world, which only the cosmos's file lists.
function useWorlds(open: boolean): Worlds["worlds"] | undefined {
  const [worlds, setWorlds] = useState<Worlds["worlds"]>();
  useEffect(() => {
    if (!open || worlds !== undefined) return;
    const leaving = new AbortController();
    // A read that fails leaves the constellations to the stamps alone: the list is the passport's, not the file's.
    readWorlds(import.meta.env.BASE_URL, { signal: leaving.signal })
      .then((file) => {
        setWorlds(file?.worlds ?? []);
      })
      .catch((error: unknown) => {
        if (!leaving.signal.aborted) setWorlds([]);
        reportError(error);
      });
    return () => {
      leaving.abort();
    };
  }, [open, worlds]);
  return worlds;
}

type Named = (id: string) => string;

function ConstellationList({ constellations }: { constellations: readonly Constellation[] }) {
  if (constellations.length === 0) return null;
  return (
    <section aria-labelledby="passport-constellations">
      <Stack space="xs">
        <h3 id="passport-constellations">Constellations</h3>
        <Stack as="ul" space="3xs">
          {constellations.map(({ id, worlds: all, stamped: some }) => (
            <li key={id}>
              <Row
                look="divided"
                title={id === EARTH ? "Earth" : id}
                subtitle={some === all ? "Every world stamped" : `${String(all - some)} still to visit`}
                trail={
                  <Progress
                    label={`Constellation ${id}`}
                    kind="steps"
                    value={some}
                    max={all}
                    shown={`${String(some)}/${String(all)}`}
                  />
                }
              />
            </li>
          ))}
        </Stack>
      </Stack>
    </section>
  );
}

function Firsts({
  ids,
  charted,
  universe,
  nameOf,
}: {
  ids: readonly string[];
  charted: Readonly<Record<string, string>>;
  universe: string;
  nameOf: Named;
}) {
  if (ids.length === 0) return null;
  return (
    <section aria-labelledby="passport-firsts">
      <Stack space="xs">
        <h3 id="passport-firsts">You charted it</h3>
        <p className={styles["note"]}>Uncharted worlds you were the first on this device to visit.</p>
        <Stack as="ul" space="3xs">
          {ids.map((id) => (
            <li key={id}>
              <Row look="divided" title={nameOf(id)} subtitle={dayOf(charted[stampKey(universe, id)] ?? "")} />
            </li>
          ))}
        </Stack>
      </Stack>
    </section>
  );
}

function Stamps({ recent, nameOf }: { recent: readonly { id: string; day: string }[]; nameOf: Named }) {
  return (
    <section aria-labelledby="passport-stamps">
      <Stack space="xs">
        <h3 id="passport-stamps">Stamps</h3>
        {recent.length === 0 ? (
          <p className={styles["note"]}>No stamp yet: visit a world and it stamps your passport.</p>
        ) : (
          <Stack as="ul" space="3xs">
            {recent.map(({ id, day }) => (
              <li key={id}>
                <Row look="divided" title={nameOf(id)} subtitle={day === "" ? "Stamped" : dayOf(day)} />
              </li>
            ))}
          </Stack>
        )}
      </Stack>
    </section>
  );
}

export function PassportView({ universe, open, onClose }: { universe: string; open: boolean; onClose: () => void }) {
  const stamps = useApp(({ device }) => device.stamps);
  const charted = useApp(({ device }) => device.charted);
  const notKept = useApp(({ device }) => device.notKept);
  const stamped = stampedIn(stamps, universe);
  const count = passportCount(stamped.size, useWorldsCount(open) ?? undefined);
  const worlds = useWorlds(open);
  const constellations = constellationsOf(worlds ?? [], stamped).filter(({ stamped: some }) => some > 0);
  const nameOf = namesOf(universe);
  const recent = [...stamped]
    .map((id) => ({ id, day: stamps[stampKey(universe, id)] ?? "" }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id));
  const firsts = [...stampedIn(charted, universe)];
  return (
    <Dialog
      title="Passport"
      description="A stamp for each world you visit, kept on this device."
      wide
      open={open}
      onClose={onClose}
    >
      <Stack space="l">
        <section aria-label="Worlds you visited">
          <Stack space="xs">
            <Stat value={stamped.size} caption="Worlds you visited" />
            {count === undefined ? null : (
              <Progress
                label="Worlds you visited"
                value={count.stamped}
                max={count.listed}
                shown={`${String(count.stamped)}/${String(count.listed)}`}
              />
            )}
          </Stack>
        </section>
        <ConstellationList constellations={constellations} />
        <Firsts ids={firsts} charted={charted} universe={universe} nameOf={nameOf} />
        <PassportSlot name="passportExpedition" universe={universe} />
        <PassportSlot name="passportQuests" universe={universe} />
        <Stamps recent={recent} nameOf={nameOf} />
        <Kicker>{notKept ? "This device did not keep the last change" : "Export or clear it in the settings"}</Kicker>
      </Stack>
    </Dialog>
  );
}
