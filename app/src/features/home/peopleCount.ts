// The hero's people online (8i), asked once the page runs and while `wanted` (the default universe's home: the relay's rooms are its own):
// "coming" while it is asked, none when the server does not say and in the page the build writes, which a reader with no script reads, so
// the hero counts the worlds there as before (F4641). The read is a chunk of its own.
import { useEffect, useState } from "react";
import { useWoken } from "./clock.ts";
import type { People } from "./Hero.tsx";

// Asked at the effect: a dynamic import inside a component fails the React Compiler's build.
const read = (signal: AbortSignal) => import("./people.ts").then(({ readPeople }) => readPeople({ signal }));
// The server counts again at most once a minute: the hero asks as often, so a page opened before its own stream counted catches up.
const EVERY_MS = 60_000;

// The last count the page was told: a home that mounts again (the way back from a page's flight) opens with it, not with the "coming" copy
// it would swap for the people's as the read answers, under the reader's eyes. Out of the hook: the React Compiler refuses a write to a module's
// variable inside one.
let last: People | undefined = "coming";
const keep = (people: People | undefined): People | undefined => (last = people);

export function usePeople(wanted: boolean): People | undefined {
  const woken = useWoken();
  const [people, setPeople] = useState<People | undefined>(() => last);
  useEffect(() => {
    if (!wanted) return undefined;
    const leaving = new AbortController();
    const ask = () => {
      read(leaving.signal)
        .then((counts) => {
          // The reader is on the site: never fewer than one online (Alexis, 2026-11-07, D352).
          if (!leaving.signal.aborted)
            setPeople(keep(counts === undefined ? undefined : { ...counts, online: Math.max(1, counts.online) }));
        })
        .catch((error: unknown) => {
          if (!leaving.signal.aborted) setPeople(keep(undefined));
          reportError(error);
        });
    };
    ask();
    // A hidden tab asks nothing: the count is asked again once the timer finds it shown.
    const timer = setInterval(() => {
      if (!document.hidden) ask();
    }, EVERY_MS);
    return () => {
      clearInterval(timer);
      leaving.abort();
    };
  }, [wanted]);
  return wanted && woken ? people : undefined;
}
