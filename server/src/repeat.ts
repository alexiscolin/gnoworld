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
