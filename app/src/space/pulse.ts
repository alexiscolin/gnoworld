// A loop that may sleep (P400): `run` is called each frame and says whether another is wanted; when it says no, no frame is asked until
// the returned `wake` is called, which asks one. Ends for good when `signal` aborts.
export function pulse(
  run: (now: number) => boolean,
  signal: AbortSignal,
  frames: (callback: (now: number) => void) => unknown = requestAnimationFrame,
): () => void {
  let asleep = false;
  const step = (now: number) => {
    asleep = false;
    if (signal.aborted) return;
    let on = true;
    try {
      on = run(now);
    } finally {
      if (on) frames(step);
      else asleep = true;
    }
  };
  frames(step);
  return () => {
    if (!asleep || signal.aborted) return;
    asleep = false;
    frames(step);
  };
}
