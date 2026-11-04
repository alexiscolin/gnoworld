// How many worlds the cosmos draws, once a read has said (slice 7d6): the home's count, or the scene's file. Alone in its module, so the
// header's passport counter (slice 8) reads it with nothing of the reads themselves.
import { useSyncExternalStore } from "react";
import { Heard } from "./heard.ts";

let drawnWorlds: number | undefined;
const counting = new Heard();

/** Says how many worlds the cosmos draws, once a read has brought it: the worlds' count the home reads, or the file the scene draws. */
export function worldsDrawn(count: number): void {
  drawnWorlds = count;
  counting.tell();
}

/** How many worlds the cosmos draws, once a read has said; nothing before, nor in the build. */
export const useWorldsDrawn = (): number | undefined =>
  useSyncExternalStore(
    counting.subscribe,
    () => drawnWorlds,
    () => undefined,
  );

/** The count said so far, none before a read. */
export const drawnNow = (): number | undefined => drawnWorlds;
