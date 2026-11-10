// What a realm is doing as figures (D530, the proposal's band): its calls with the last thirty days beside them, its callers, its last call and
// who imports it. A figure no source gave is a word in its place ("Never"), never a made zero; with no rollup the worlds' file's counts stand,
// with no line and no time.
import type { Figure } from "@gnoworld/ui";
import type { RealmRollup, Worlds } from "@gnoworld/schemas/indexer";
import { ago, dayLabel, dayValues } from "./days.ts";
import { grouped, noun } from "./figures.ts";

type Held = Worlds["worlds"][number]["realms"][number];

const LAST_DAYS = 30;

function callsOf(rollup: RealmRollup | undefined, held: Held | undefined): Figure | undefined {
  const calls = rollup?.calls ?? held?.calls;
  if (calls === undefined || calls === null) return undefined;
  if (rollup === undefined) return { key: "calls", label: "Calls", value: calls, sub: "direct calls" };
  const days = dayValues(rollup.days, rollup.updated);
  const recent = days.slice(-LAST_DAYS).reduce((sum, day) => sum + day.calls, 0);
  return {
    key: "calls",
    label: "Calls",
    value: calls,
    sub:
      calls === 0
        ? "nobody has called it yet"
        : recent === calls
          ? "direct calls, all in the last 30 days"
          : `direct calls · ${grouped(recent)} in the last 30 days`,
    spark: calls === 0 ? undefined : days.slice(-LAST_DAYS).map((day) => day.calls),
  };
}

function lastOf(rollup: RealmRollup | undefined, now: number): Figure | undefined {
  if (rollup === undefined) return undefined;
  const newest = rollup.last[0];
  const at = newest?.time == null ? Number.NaN : Date.parse(newest.time);
  if (newest === undefined || Number.isNaN(at)) {
    return {
      key: "last",
      label: "Last call",
      value: "Never",
      sub: rollup.calls === 0 ? "nobody has called it" : "its time is not read",
    };
  }
  const { value, unit } = ago(at, now);
  return {
    key: "last",
    label: "Last call",
    value,
    unit,
    sub: `${newest.func ?? "a call"} · ${dayLabel(newest.time?.slice(0, 10) ?? "")}`,
  };
}

export function realmFigures({
  held,
  rollup,
  importers,
  now,
}: {
  held: Held | undefined;
  rollup: RealmRollup | undefined;
  /** The realms and packages of the worlds' file that import it, when the file has come. */
  importers: number | undefined;
  now: number;
}): Figure[] {
  const callers = rollup?.callers ?? held?.callers;
  const total = rollup?.importers.total ?? importers;
  const made: (Figure | undefined)[] = [
    callsOf(rollup, held),
    callers == null
      ? undefined
      : {
          key: "callers",
          label: "Callers",
          value: callers,
          sub: callers === 0 ? "nobody yet" : `distinct ${noun(callers, "address", "addresses")}, all time`,
        },
    lastOf(rollup, now),
    total === undefined
      ? undefined
      : {
          key: "importers",
          label: "Imported by",
          value: total,
          sub: total === 0 ? "nothing imports it yet" : "realms and packages that import it",
        },
  ];
  return made.filter((figure) => figure !== undefined);
}
