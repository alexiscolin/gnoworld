// Whether a glance would take two stations for one (ADR-0002 §3's rule, as the planets' variety.ts reads it): how many parts of each kind
// they hold, and the shape their parts draw, each a share of its reach; a count apart, or a shape a tenth apart, is a station apart.
import { PART_KINDS, type Part } from "./parts.ts";
import type { Station } from "./station.ts";

interface Look {
  readonly counts: readonly number[];
  /** How far its parts stand along the spine and out from it, and the widest wheel's reach, each 0 to 1. */
  readonly shape: readonly number[];
}

const SAME_SHAPE = 0.1;

const along = (parts: readonly Part[]) => Math.max(...parts.map(({ at }) => Math.abs(at.y)));
const out = (parts: readonly Part[]) => Math.max(...parts.map(({ at }) => Math.hypot(at.x, at.z)));
const wheel = (parts: readonly Part[]) =>
  Math.max(0, ...parts.filter(({ kind }) => kind === "ring" || kind === "band").map(({ size }) => size.x));

export function lookOf({ parts }: Station): Look {
  return {
    counts: PART_KINDS.map((kind) => parts.filter((part) => part.kind === kind).length),
    shape: [along(parts), out(parts), wheel(parts)],
  };
}

/** Whether two stations' looks would read as one. */
export const alikeStations = (a: Look, b: Look): boolean =>
  a.counts.every((count, index) => count === b.counts[index]) &&
  a.shape.every((value, index) => Math.abs(value - (b.shape[index] ?? Infinity)) < SAME_SHAPE);
