// A plate's hours (8g): the world's chat hours, asked once the page runs; the read is a chunk of its own (hours.ts).
import type { PresenceHours } from "@gnoworld/schemas/indexer";
import { useLateRead } from "../../lateRead.ts";

// Asked at the effect: a dynamic import inside a component fails the React Compiler's build.
const read = (world: string, signal: AbortSignal) =>
  import("./hours.ts").then(({ readHours }) => readHours(world, { signal }));

export type Hours = PresenceHours;

/** The hours of `world` (as who is here names it) once read; undefined while they come or when the server gave none. */
export const useHours = (world: string): Hours | undefined => useLateRead(world, read);
