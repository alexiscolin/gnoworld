// How many worlds the cosmos draws (slice 7d6): whichever read of the worlds' file brings it says it (worldsFile.ts, 7n), and the first
// screen's hero reads it. Alone in its module, so the door and the chunk it opens do not import each other.
import { useSyncExternalStore } from "react";

let drawnWorlds: number | undefined;
const counting = new Set<() => void>();

/** Says how many worlds the cosmos draws, once a read of the worlds' file has brought it. */
export function worldsDrawn(count: number): void {
  drawnWorlds = count;
  for (const tell of counting) tell();
}

const countedBy = (tell: () => void) => {
  counting.add(tell);
  return () => {
    counting.delete(tell);
  };
};

/** How many worlds the cosmos draws, once a read has said; nothing before, nor in the build. */
export const useWorldsDrawn = (): number | undefined =>
  useSyncExternalStore(
    countedBy,
    () => drawnWorlds,
    () => undefined,
  );
