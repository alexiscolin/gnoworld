import { useEffect, useEffectEvent } from "react";

/** Calls `onHide` each time the page hides. */
export function useOnHide(onHide: () => void) {
  const hidden = useEffectEvent(onHide);
  useEffect(() => {
    const hides = () => {
      if (document.visibilityState === "hidden") hidden();
    };
    document.addEventListener("visibilitychange", hides);
    return () => {
      document.removeEventListener("visibilitychange", hides);
    };
  }, []);
}
