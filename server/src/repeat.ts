import { reachedNothing, type Kind } from "./net.ts";

/** How soon a pass that reached nothing runs again: Compose starts the server before its way out (deploy/compose.yaml), and a first pass
 * finds none. */
const RETRY_MS = 15_000;

/** The wait after a pass that ended with the fault `kind`, none when it went well: RETRY_MS after a call that reached nothing, never past
 * `everyMs`, and the whole interval after anything else. */
export const waitAfter = (kind: Kind | undefined, everyMs: number): number =>
  kind !== undefined && reachedNothing(kind) ? Math.min(RETRY_MS, everyMs) : everyMs;

/** What a job's pass gives back, never throwing: it wrote its file, or the kind of fault that kept the last one. */
export type Outcome = { wrote: true } | { wrote: false; kind: Kind };

/** `repeat`'s wait for a job whose pass gives an Outcome: waitAfter its fault, and the whole interval after a pass that threw. */
export const waitAfterOutcome =
  (everyMs: number) =>
  (_error?: unknown, outcome?: Outcome): number =>
    waitAfter(outcome?.wrote === false ? outcome.kind : undefined, everyMs);

/** What a timer gives back: `stop` ends the waiting, and a pass under way is told. */
export interface Repeating {
  stop: () => void;
}

interface Loop<T> {
  pass: (isStopped: () => boolean) => Promise<T>;
  /** A pass that failed, unless the loop was stopped by then. */
  failed: (error: unknown) => void;
  /** How long to wait from the end of a pass; `error` is its failure, if it failed, else `value` what it gave back. */
  waitMs: (error?: unknown, value?: T) => number;
}

/** Runs `pass` at once and again after each one ends and its wait is over: one at a time, so a slow pass never piles up. */
export function repeat<T>({ pass, failed, waitMs }: Loop<T>): Repeating {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const isStopped = (): boolean => stopped;
  const next = (error?: unknown, value?: T): void => {
    if (!stopped) timer = setTimeout(tick, waitMs(error, value));
  };
  function tick(): void {
    pass(isStopped).then(
      (value) => {
        next(undefined, value);
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
