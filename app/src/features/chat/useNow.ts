import { useEffect, useState } from "react";

/** The time in the browser, read once and again every minute: what counts a window ("talking now") goes on as the minutes pass. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(tick);
    };
  }, []);
  return now;
}
