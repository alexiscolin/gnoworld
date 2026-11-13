// A failure the page can stand in for: a chunk that cannot be fetched (a new deploy renamed it) leaves its place to a fallback, and the
// browser's error channel still hears of it, so a bug never hides behind the fallback.

/** `promise`'s value, or `fallback` once its failure is reported. */
export const reportedOr = <T, F>(promise: Promise<T>, fallback: F): Promise<T | F> =>
  promise.catch((error: unknown) => {
    reportError(error);
    return fallback;
  });
