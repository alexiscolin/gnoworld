// The lines a reader has not seen yet, tinted until the place passes them (the tint's fade is CSS: LineView's `data-unseen`).
import type { Line } from "@gnoworld/core";
import { useEffect, useEffectEvent, useState } from "react";

/** The unseen lines' msgids, and the time of the newest line decided on: a line past it is an arrival, one before it came
 * from the history above. */
export interface Unseen {
  readonly ids: ReadonlySet<string>;
  readonly newest: string | undefined;
}

interface Reading {
  readonly lines: readonly Line[];
  readonly read: string | undefined;
  readonly me: string | undefined;
  /** Whether the reader is away from the end, or the tab hidden: what comes then is not seen. */
  readonly away: boolean;
}

const past = (time: string, read: string | undefined) => read === undefined || time > read;
const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...b].every((id) => a.has(id));

// The marked lines the place has not passed yet, then the arrivals to mark: every line past the place as the room opens, and those
// that come while the reader is away; the reader's own never.
function marked(prev: Unseen | undefined, come: readonly Line[], { lines, read, me, away }: Reading): Set<string> {
  const ids = new Set(
    lines.filter(({ id, time }) => prev?.ids.has(id) === true && past(time, read)).map(({ id }) => id),
  );
  if (prev !== undefined && !away) return ids;
  for (const { id, time, account } of come) if (account !== me && past(time, read)) ids.add(id);
  return ids;
}

// The lines past the newest one decided on: all of them as the room opens.
const arrivals = (lines: readonly Line[], from: string | undefined) =>
  from === undefined ? lines : lines.filter(({ time }) => time > from);
const unchanged = (prev: Unseen | undefined, ids: ReadonlySet<string>, newest: string | undefined): prev is Unseen =>
  prev !== undefined && prev.newest === newest && same(prev.ids, ids);

/** What is unseen once the room holds `lines`: none decided until a line and the place are known; then the lines past the
 * place as the room opened, and each line that comes while the reader is `away`; a line the place passes leaves. The same
 * object when nothing changed. */
export function unseenAfter(prev: Unseen | undefined, reading: Reading): Unseen | undefined {
  const { lines, read } = reading;
  if (prev === undefined && (lines.length === 0 || read === undefined)) return undefined;
  const from = prev?.newest;
  const come = arrivals(lines, from);
  const ids = marked(prev, come, reading);
  const newest = come.at(-1)?.time ?? from;
  return unchanged(prev, ids, newest) ? prev : { ids, newest };
}

/** Whether the reader is away from the end or the tab hidden, as last scrolled or shown; `look` reads it again (the list's scroll
 * calls it). */
export function useAway(seesEnd: () => boolean) {
  const [away, setAway] = useState(false);
  const look = () => {
    setAway(document.visibilityState !== "visible" || !seesEnd());
  };
  const shown = useEffectEvent(look);
  useEffect(() => {
    const shows = () => {
      shown();
    };
    document.addEventListener("visibilitychange", shows);
    return () => {
      document.removeEventListener("visibilitychange", shows);
    };
  }, []);
  return { away, look };
}

const NONE: ReadonlySet<string> = new Set();

/** The room's unseen lines, decided in the render that brings a line (React's update while rendering), so a line is tinted from
 * its first paint. */
export function useUnseen(paged: boolean, reading: Reading): ReadonlySet<string> {
  const [unseen, setUnseen] = useState<Unseen>();
  const next = paged ? unseenAfter(unseen, reading) : undefined;
  if (next !== unseen) setUnseen(next);
  return next?.ids ?? NONE;
}
