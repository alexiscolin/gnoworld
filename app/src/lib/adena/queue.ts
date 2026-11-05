// Adena opens one popup at a time, and a new one closes the open one: its requests go one after another, in the
// order asked. No timeout (D201): the popup waits for the person, and a "failed" given while a late signature
// still lands would be false; a reload frees the queue.
let tail: Promise<unknown> = Promise.resolve();

/** Runs a request once those asked before it have finished, however they ended; its result or rejection is its own. */
export function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  // The rejection is its caller's, not the next request's: the tail only waits for the end.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
