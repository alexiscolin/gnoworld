// A wait its caller may leave: what a promise gives, or none once a signal fires first, its listener removed either way.

/** What `work` gives, or undefined once `signal` fires first (at once if it has fired); `work` itself runs on. */
export async function until<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T | undefined> {
  if (signal === undefined) return work;
  let gone = (): void => undefined;
  const left = new Promise<undefined>((resolve) => {
    gone = () => {
      resolve(undefined);
    };
    signal.addEventListener("abort", gone, { once: true });
    if (signal.aborted) gone();
  });
  try {
    return await Promise.race([work, left]);
  } finally {
    signal.removeEventListener("abort", gone);
  }
}
