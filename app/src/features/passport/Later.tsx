// A place's arrival, its code asked a moment after the first screen (later.ts): the pill shows as the place settles, a second after the
// page has loaded, about when a flight lands it (frames 23, 93).
import { lazy, Suspense } from "react";
import { useAfterLoad } from "../../later.ts";
import type { ArrivalProps } from "./Arrival.tsx";

const SETTLED_MS = 1000;

const Now = lazy(async () => ({ default: (await import("./Arrival.tsx")).Arrival }));

export function Arrival(props: ArrivalProps) {
  return useAfterLoad(SETTLED_MS) ? (
    <Suspense fallback={null}>
      <Now {...props} />
    </Suspense>
  ) : null;
}
