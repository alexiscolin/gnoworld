// A fixed window per key, in memory (ADR-0002 §7: one process, nothing to share): at most `max` calls
// per `windowMs`, and at most `keys` keys held.
import { remember } from "./remember.ts";

export interface Limiter {
  take: (key: string, now: number) => boolean;
  // Whether a key's window already holds `max` calls; asking counts nothing.
  full: (key: string, now: number) => boolean;
  size: () => number;
}

export function limiter({ max, windowMs, keys }: { max: number; windowMs: number; keys: number }): Limiter {
  // A key is set again when its window starts, so the Map's first key is the one whose window started first.
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key, now) {
      let window = windows.get(key);
      if (window === undefined || now - window.start >= windowMs) {
        window = { start: now, count: 0 };
        // ponytail: past the cap, the key whose window started first goes and starts over if it comes
        // back; the cap is set far above the visitors one window sees.
        remember(windows, [key, window], keys);
      }
      window.count += 1;
      return window.count <= max;
    },
    full(key, now) {
      const window = windows.get(key);
      return window !== undefined && now - window.start < windowMs && window.count >= max;
    },
    size: () => windows.size,
  };
}
