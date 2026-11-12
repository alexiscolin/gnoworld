// What stands in the account menu's chunk of Jarvis (10u-a): while the chat in view can ask Jarvis, it listens for the first ask, and only
// then brings the host, with the realms' call code and the chat's drawing, which it hands that ask.
import { lazy, Suspense, useEffect, useState } from "react";
import { useJarvisHere } from "../../jarvisHere.ts";
import { onAsked } from "../../pageAsks.ts";

const JarvisHost = lazy(async () => ({ default: (await import("./JarvisHost.tsx")).JarvisHost }));

export type FirstAsk = "jarvis" | "jarvis-catch-up" | "jarvis-ask";

/** `early`: the ask the page made before this code came, which it takes as its first. */
export function JarvisListener({ early }: { early?: FirstAsk | undefined }) {
  const here = useJarvisHere() !== undefined;
  const [first, setFirst] = useState<FirstAsk | undefined>(early);
  const listening = here && first === undefined;
  useEffect(() => {
    if (!listening) return undefined;
    const stop = new AbortController();
    onAsked(
      "jarvis",
      () => {
        setFirst("jarvis");
      },
      stop.signal,
    );
    onAsked(
      "jarvis-catch-up",
      () => {
        setFirst("jarvis-catch-up");
      },
      stop.signal,
    );
    onAsked(
      "jarvis-ask",
      () => {
        setFirst("jarvis-ask");
      },
      stop.signal,
    );
    return () => {
      stop.abort();
    };
  }, [listening]);
  return first === undefined ? null : (
    <Suspense fallback={null}>
      <JarvisHost first={first} />
    </Suspense>
  );
}
