// A part whose content changes with the place, the rail's worlds or the hero's system (D428): what it shows fades out where it stands,
// then the new content fades in, never swapped at once; a change of the same content under the same key shows as it comes.
import { useEffect, useState, type RefObject } from "react";
import { swapIn } from "./features/universe/rise.ts";

/** `value` as `part` shows it: under a new `key`, the last one till `part` has faded out. */
export function useSwapped<T>(key: string, value: T, part: RefObject<HTMLElement | null>): T {
  const [shown, setShown] = useState({ key, value });
  if (shown.key === key && shown.value !== value) setShown({ key, value });
  const leaving = shown.key !== key;
  useEffect(() => {
    if (!leaving) return undefined;
    let swapped = false;
    const swap = () => {
      swapped = true;
      setShown({ key, value });
    };
    const target = part.current;
    if (target === null) {
      queueMicrotask(swap);
      return undefined;
    }
    const tween = swapIn(target, swap);
    // A change while it fades out starts the fade anew from where it stands; once swapped, the new content fades in whatever comes.
    return () => {
      if (!swapped) tween.kill();
    };
  }, [leaving, key, value, part]);
  return shown.value;
}
