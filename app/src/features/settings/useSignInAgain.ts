// A link or an unlink needs a login of the last ten minutes: "Sign in again to confirm" asks the page's one login control (pageAsks.ts), and
// once that login has run its course, `retry` runs, once.
import { useEffect, useRef, useState } from "react";
import { askFor } from "../../pageAsks.ts";
import { useApp } from "../../storeContext.tsx";

export function useSignInAgain(retry: () => void) {
  const step = useApp(({ login }) => login.step);
  const [phase, setPhase] = useState<"none" | "asked" | "running" | "done">("none");
  const firedRef = useRef(false);
  if (phase === "asked" && step !== "idle") setPhase("running");
  if (phase === "running" && step === "idle") setPhase("done");
  useEffect(() => {
    if (phase !== "done" || firedRef.current) return;
    firedRef.current = true;
    retry();
  }, [phase, retry]);
  return {
    waiting: phase === "asked" || phase === "running",
    ask: () => {
      firedRef.current = false;
      setPhase("asked");
      askFor("log-in");
    },
  };
}
