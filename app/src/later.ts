// What a page shows a moment after its first screen (slice 8: the arrival's pill, the device's reader): its code is asked once the page
// has loaded and the browser rests, never with what the first paint needs.
import { useEffect, useState } from "react";

/** Calls `then` once the page has loaded and the browser has a moment, `wait` ms more if asked, until `signal` aborts; with no signal, for
 * the page's whole life. */
export function afterLoad(then: () => void, signal?: AbortSignal, wait = 0): void {
  const later = () => {
    if (wait === 0) {
      then();
      return;
    }
    const timer = setTimeout(then, wait);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
    });
  };
  const rest = () => {
    if (signal?.aborted === true) return;
    if ("requestIdleCallback" in window) {
      const asked = requestIdleCallback(later, { timeout: 2000 });
      signal?.addEventListener("abort", () => {
        cancelIdleCallback(asked);
      });
    } else {
      const timer = setTimeout(later, 200);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
      });
    }
  };
  if (document.readyState === "complete") rest();
  else addEventListener("load", rest, { once: true, ...(signal === undefined ? {} : { signal }) });
}

/** False until the page has loaded and the browser has had a moment, and `wait` ms more. */
export function useAfterLoad(wait = 0): boolean {
  const [now, setNow] = useState(false);
  useEffect(() => {
    const leaving = new AbortController();
    afterLoad(
      () => {
        setNow(true);
      },
      leaving.signal,
      wait,
    );
    return () => {
      leaving.abort();
    };
  }, [wait]);
  return now;
}

/** True once the page has loaded and the browser rests; false once `signal` aborts first. */
export const restsFor = (signal?: AbortSignal) =>
  new Promise<boolean>((done) => {
    signal?.addEventListener("abort", () => {
      done(false);
    });
    afterLoad(() => {
      done(true);
    }, signal);
  });
