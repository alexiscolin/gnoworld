// The hero's people online (8i), asked once the page runs and while `wanted` (the default universe's home: the relay's rooms are its own):
// "coming" while it is asked, none when the server does not say and in the page the build writes, which a reader with no script reads, so
// the hero counts the worlds there as before (F4641). The read is a chunk of its own.
import { useEffect, useState } from "react";
import { useWoken } from "./clock.ts";
import type { People } from "./Hero.tsx";

// Asked at the effect: a dynamic import inside a component fails the React Compiler's build.
const read = (signal: AbortSignal) => import("./people.ts").then(({ readPeople }) => readPeople({ signal }));

export function usePeople(wanted: boolean): People | undefined {
  const woken = useWoken();
  const [people, setPeople] = useState<People | undefined>("coming");
  useEffect(() => {
    if (!wanted) return undefined;
    const leaving = new AbortController();
    read(leaving.signal)
      .then((counts) => {
        if (!leaving.signal.aborted) setPeople(counts);
      })
      .catch((error: unknown) => {
        if (!leaving.signal.aborted) setPeople(undefined);
        reportError(error);
      });
    return () => {
      leaving.abort();
    };
  }, [wanted]);
  return wanted && woken ? people : undefined;
}
