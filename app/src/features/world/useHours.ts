// A plate's activity (8g): the world's hours, asked once the page runs; the read is a chunk of its own (hours.ts).
import type { PresenceHours } from "@gnoworld/schemas/indexer";
import { useLateRead } from "../../lateRead.ts";

// Asked at the effect: a dynamic import inside a component fails the React Compiler's build. The chart's code is asked as the read starts,
// beside it, so a history adds no wait (Alexis, 2026-11-04, "Charger avec leur donnée").
const read = (world: string, signal: AbortSignal) => {
  import("./Bars.tsx").catch(reportError);
  return import("./hours.ts").then(({ readHours }) => readHours(world, { signal }));
};

export type Hours = PresenceHours;

/** The hours of `world` (as who is here names it) once read; undefined while they come or when the server gave none. */
export const useHours = (world: string): Hours | undefined => useLateRead(world, read);
