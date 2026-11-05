import { reachedNothing, type Kind } from "./net.ts";

/** How soon a pass that reached nothing runs again: Compose starts the server before its way out (deploy/compose.yaml), and a first pass
 * finds none. */
const RETRY_MS = 15_000;

/** The wait after a pass that ended with the fault `kind`, none when it went well: RETRY_MS after a call that reached nothing, never past
 * `everyMs`, and the whole interval after anything else. */
export const waitAfter = (kind: Kind | undefined, everyMs: number): number =>
  kind !== undefined && reachedNothing(kind) ? Math.min(RETRY_MS, everyMs) : everyMs;

/** What a timer gives back: `stop` ends the waiting, and a pass under way is told. */
export interface Repeating {
  stop: () => void;
}

interface Loop {
  pass: (isStopped: () => boolean) => Promise<unknown>;
  /** A pass that failed, unless the loop was stopped by then. */
  failed: (error: unknown) => void;
  /** How long to wait from the end of a pass; `error` is its failure, if it failed. */
  waitMs: (error?: unknown) => number;
}

/** Runs `pass` at once and again after each one ends and its wait is over: one at a time, so a slow pass never piles up. */
export function repeat({ pass, failed, waitMs }: Loop): Repeating {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const isStopped = (): boolean => stopped;
  const next = (error?: unknown): void => {
    if (!stopped) timer = setTimeout(tick, waitMs(error));
  };
  function tick(): void {
    pass(isStopped).then(
      () => {
        next();
      },
      (error: unknown) => {
        if (!stopped) failed(error);
        next(error);
      },
    );
  }
  tick();
  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
