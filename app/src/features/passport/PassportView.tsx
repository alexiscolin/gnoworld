// The passport: a dialog over the place, its figures and its three tabs on one row (Challenges: today's expedition and the quests, Stamps: a
// stamp for each world this device visited, by day, Charted: the ones charted first). Its code comes when it is first opened. Nothing of it
// leaves the device.
import { EARTH, hubWorldOf, labelName, passportCount, utcDay } from "@gnoworld/core";
import { Badge, Cluster, Dialog, Kicker, Skeleton, Stack, Stat, Tabs } from "@gnoworld/ui";
import { Suspense, useState } from "react";
import { site } from "../../places.ts";
import { PassportSlot } from "../../slots.tsx";
import { useApp } from "../../storeContext.tsx";
import { useWorldsFile } from "../../worldsFile.ts";
import { useShownName } from "../names/index.ts";
import { challengeSteps } from "../quests/index.ts";
import { useWorldsCount } from "../universe/index.ts";
import appear from "../../enter.module.css";
import { TabRow } from "../../TabRow.tsx";
import { ChartedTab, StampsTab } from "./StampsTab.tsx";
import { stampsOf } from "./stamps.ts";

const hubsOf = (universe: string) => site.worlds.filter((world) => world.universe === universe);

// The moment the dialog last opened: a passport left mounted past midnight takes the new day when it opens again.
function useOpenedAt(open: boolean): Date {
  const [at, setAt] = useState(() => new Date());
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setAt(() => new Date());
  }
  return at;
}

// A world's name as the reader knows it: a hub's own, the Earth's, else the one its id gives.
function namesOf(universe: string): (id: string) => string {
  const hubs = new Map(hubsOf(universe).map((world) => [hubWorldOf(world), world.name]));
  return (id) => hubs.get(id) ?? (id === EARTH ? "Earth" : (labelName(id) ?? id));
}

// The figures at the row's start, narrow enough to leave the tabs on their row: the stamps out of the worlds listed ("108/594"), the
// systems, the worlds charted first, the challenge steps.
function Figures({
  stamps,
  count,
  systems,
  first,
  steps,
  loading,
}: {
  stamps: number;
  count: { stamped: number; listed: number } | undefined;
  systems: number;
  first: number;
  steps: { done: number; of: number };
  loading: boolean;
}) {
  return (
    <Cluster space="s" align="baseline">
      <Stat
        size="s"
        value={count === undefined ? stamps : count.stamped}
        {...(count === undefined ? {} : { unit: `/${String(count.listed)}` })}
        caption="stamps"
      />
      {loading ? (
        <Stack space="2xs">
          <Skeleton />
          <Skeleton />
        </Stack>
      ) : (
        <Stat size="s" value={systems} caption="systems" />
      )}
      <Stat size="s" value={first} caption="charted first" />
      <Stat size="s" value={steps.done} unit={`/${String(steps.of)}`} caption="steps" />
    </Cluster>
  );
}

type TabId = "challenges" | "stamps" | "charted";

// The three tabs, pinned at the row's end.
function PassportTabs({
  tab,
  onSelect,
  stamps,
  charted,
}: {
  tab: TabId;
  onSelect: (tab: TabId) => void;
  stamps: number;
  charted: number;
}) {
  return (
    <Tabs
      label="Passport"
      size="s"
      selected={tab}
      onSelect={(id) => {
        onSelect(id === "stamps" || id === "charted" ? id : "challenges");
      }}
      tabs={[
        { id: "challenges", label: "Challenges" },
        { id: "stamps", label: "Stamps", count: stamps },
        { id: "charted", label: "Charted", count: charted },
      ]}
    />
  );
}

function Passport({
  universe,
  open,
  onClose,
  who,
}: {
  universe: string;
  open: boolean;
  onClose: () => void;
  who: string;
}) {
  const [tab, setTab] = useState<TabId>("challenges");
  // The day the dialog opened on, as the expedition's card keeps it.
  const now = useOpenedAt(open);
  const device = useApp(({ device: held }) => held);
  const universeName = site.universes.find(({ id }) => id === universe)?.name ?? universe;
  const worlds = useWorldsFile(open);
  const stamps = stampsOf({
    universe,
    universeName,
    stamps: device.stamps,
    charted: device.charted,
    nameOf: namesOf(universe),
    worlds: worlds ?? [],
    hubs: new Set(hubsOf(universe).map(hubWorldOf)),
  });
  const first = stamps.filter(({ gold }) => gold);
  const count = passportCount(stamps.length, useWorldsCount(open) ?? undefined);
  const steps = challengeSteps(universe, utcDay(now), device);
  const systems = new Set(stamps.map(({ system }) => system)).size;
  return (
    <Dialog
      title={who}
      kicker={who === "Passport" ? universeName : `Passport · ${universeName}`}
      wide
      open={open}
      onClose={onClose}
      lead={<Badge name={universe} icon="passport" tone="primary" earned />}
    >
      <Stack space="m">
        <TabRow
          figures={
            <Figures
              stamps={stamps.length}
              count={count}
              systems={systems}
              first={first.length}
              steps={steps}
              loading={worlds === undefined}
            />
          }
          tabs={<PassportTabs tab={tab} onSelect={setTab} stamps={stamps.length} charted={first.length} />}
        />
        <div role="tabpanel" key={tab} className={appear["enter"]}>
          {tab === "challenges" ? (
            <Stack space="m">
              <Suspense fallback={<Skeleton shape="card" />}>
                <PassportSlot key={now.getTime()} name="passportExpedition" universe={universe} />
              </Suspense>
              <Suspense fallback={<Skeleton shape="card" />}>
                <PassportSlot name="passportQuests" universe={universe} />
              </Suspense>
            </Stack>
          ) : tab === "stamps" ? (
            <StampsTab stamps={stamps} now={now} />
          ) : (
            <ChartedTab stamps={first} now={now} />
          )}
        </div>
        <Kicker>
          {device.notKept ? "This device did not keep the last change" : "Export or clear it in the settings"}
        </Kicker>
      </Stack>
    </Dialog>
  );
}

// The account's name heads the dialog; its read comes only for a session that is in.
function Named(props: { universe: string; open: boolean; onClose: () => void; account: string }) {
  const { account, ...rest } = props;
  const who = useShownName(account, props.universe);
  return <Passport {...rest} who={who} />;
}

export function PassportView(props: { universe: string; open: boolean; onClose: () => void }) {
  const session = useApp(({ login }) => login.session);
  return session.kind === "in" ? (
    <Named {...props} account={session.address} />
  ) : (
    <Passport {...props} who="Passport" />
  );
}
