// The seconds left of a code that lives `seconds`, counted from the moment the component holding it appears: a code is shown from its arrival, so
// the page's own clock decides and the browser's date never does. It ticks each second, its timer cleared with the component.
import { useEffect, useState } from "react";

export function useCountdown(seconds: number): number {
  const [from] = useState(() => Date.now());
  const [now, setNow] = useState(from);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return Math.max(0, seconds - Math.floor((now - from) / 1000));
}

/** Seconds as the clock shows them: 9:05. */
export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
