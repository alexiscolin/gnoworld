// Calls per day, with its last calls (the proposal's act card, D566): the rollup's days as bars on a log or a linear scale, over every day since the
// first call (a day with none a dot), the range (all or 14 days), then its last calls as a paged list of three that Expand opens to a hundred: who,
// which function, when. Every text is the rollup's, checked by its schema; nothing here is made up.
import { useState } from "react";
import { Card, Cell, Cluster, DayChart, PagedList, Stack, Tabs } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { CallRow } from "./CallRow.tsx";
import { dayLabel, dayValues } from "./days.ts";
import { grouped } from "./figures.ts";
import { callerName } from "./names.ts";
import styles from "./Chart.module.css";

type Call = RealmRollup["last"][number] & { at: number };

const SCALES = [
  { id: "log", label: "Log" },
  { id: "linear", label: "Linear" },
];
const RANGES = [
  { id: "all", label: "All" },
  { id: "14", label: "14 d" },
];
const FORTNIGHT = 14;
const OPENS_WITH = 3;

// The closed list of orders: the newest first as the rollup gives them, or by function.
const SORTS = [
  { id: "newest", label: "Newest", compare: (a: Call, b: Call) => a.at - b.at },
  { id: "function", label: "By function", compare: (a: Call, b: Call) => (a.func ?? "").localeCompare(b.func ?? "") },
];

const KINDS = ["all", "ok", "failed"] as const;
type Kind = (typeof KINDS)[number];
const kindLabel = { all: "All", ok: "Succeeded", failed: "Failed" } as const;

// The chart under the header, and what it says of its days.
function CallsChart({
  days,
  scale,
  failed,
  all,
}: {
  days: ReturnType<typeof dayValues>;
  scale: "log" | "linear";
  failed: number;
  all: number;
}) {
  const quiet = days.filter((day) => day.calls === 0).length;
  return (
    <>
      <DayChart
        label="Calls per day"
        scale={scale}
        values={days.map((d) => d.calls)}
        labels={days.map((d) => dayLabel(d.day))}
        callers={days.map((d) => d.callers)}
      />
      <Stack space="2xs">
        <span
          className={styles["foot"]}
        >{`${String(quiet)} of ${String(days.length)} days without a call (small dots).`}</span>
        {all === 0 ? null : (
          <span className={styles["foot"]}>
            {failed === 0
              ? `All ${grouped(all)} of its last calls succeeded (indexer).`
              : `${grouped(failed)} of its last ${grouped(all)} calls failed (indexer).`}
          </span>
        )}
      </Stack>
    </>
  );
}

// Its last calls: the kind tabs, then the paged list of three that Expand opens to a hundred.
function CallsList({
  rollup,
  worlds,
  open,
}: {
  rollup: RealmRollup;
  worlds: Worlds["worlds"] | undefined;
  open: boolean;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const calls: Call[] = rollup.last.map((call, at) => ({ ...call, at }));
  const counts = {
    all: calls.length,
    ok: calls.filter((c) => c.success).length,
    failed: calls.filter((c) => !c.success).length,
  };
  return (
    <>
      <Cluster>
        <Tabs
          label="Calls shown"
          size="xs"
          tabs={KINDS.map((id) => ({ id, label: `${kindLabel[id]} ${String(counts[id])}` }))}
          selected={kind}
          onSelect={(id) => {
            setKind(KINDS.find((each) => each === id) ?? "all");
          }}
        />
      </Cluster>
      <PagedList
        label="calls"
        items={calls.filter((c) => kind === "all" || (kind === "ok") === c.success)}
        keyOf={({ at }) => String(at)}
        textOf={({ caller, func }) => `${callerName(worlds, caller)} ${caller ?? ""} ${func ?? ""}`}
        sorts={SORTS}
        page={OPENS_WITH}
        bare
        expanded={open}
        empty={kind === "failed" ? "No failed call." : "No call matches."}
        note={`the last ${grouped(rollup.last.length)} of ${grouped(rollup.calls)} calls`}
        render={(call) => <CallRow call={call} worlds={worlds} universe={rollup.universe} />}
      />
    </>
  );
}

// The two segmented rows of the header: the scale, then the range.
function Segments({
  scale,
  range,
  onScale,
  onRange,
}: {
  scale: string;
  range: string;
  onScale: (id: "log" | "linear") => void;
  onRange: (id: "all" | "14") => void;
}) {
  return (
    <>
      <Tabs
        label="Scale"
        size="xs"
        tabs={SCALES}
        selected={scale}
        onSelect={(id) => {
          onScale(id === "linear" ? "linear" : "log");
        }}
      />
      <Tabs
        label="Range"
        size="xs"
        tabs={RANGES}
        selected={range}
        onSelect={(id) => {
          onRange(id === "14" ? "14" : "all");
        }}
      />
    </>
  );
}

export function Calls({
  rollup,
  worlds,
  beside,
}: {
  rollup: RealmRollup;
  worlds: Worlds["worlds"] | undefined;
  /** Who calls it stands beside it, so it takes eight columns, all twelve once open. */
  beside: boolean;
}) {
  const [scale, setScale] = useState<"log" | "linear">("log");
  const [range, setRange] = useState<"all" | "14">("all");
  const [open, setOpen] = useState(false);
  const every = dayValues(rollup.days, rollup.updated);
  if (every.length === 0 && rollup.last.length === 0) return null;
  const failed = rollup.last.filter((call) => !call.success).length;
  return (
    <Cell span={open || !beside ? 12 : 8}>
      <Card look="hub" fixed rises open={open}>
        <Card.Header
          icon="chart"
          title="Calls per day"
          level={2}
          actions={<Segments scale={scale} range={range} onScale={setScale} onRange={setRange} />}
          expand={{
            open,
            onToggle: () => {
              setOpen(!open);
            },
          }}
        />
        <Card.Body>
          <Stack space="s">
            {every.length === 0 ? null : (
              <CallsChart
                days={range === "14" ? every.slice(-FORTNIGHT) : every}
                scale={scale}
                failed={failed}
                all={rollup.last.length}
              />
            )}
            {rollup.last.length === 0 ? null : <CallsList rollup={rollup} worlds={worlds} open={open} />}
          </Stack>
        </Card.Body>
      </Card>
    </Cell>
  );
}
