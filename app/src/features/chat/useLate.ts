// Whether something has been waited for past a time: what waits says so then, in place of waiting for good.
import { useEffect, useState } from "react";

/** Whether `waiting` has lasted `ms` or more; false again as soon as the wait ends. */
export function useLate(waiting: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setLate(true);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [waiting, ms]);
  return late && waiting;
}
