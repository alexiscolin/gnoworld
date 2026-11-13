// The slot of the network's line: its chunk and its request come once the page has loaded and the browser rests, never with the first screen.
import { lazy, Suspense } from "react";
import { useAfterLoad } from "../../later.ts";

const NetworkLine = lazy(() => import("./NetworkLine.tsx"));

export function Network({ name }: { name: string }) {
  return useAfterLoad() ? (
    <Suspense fallback={null}>
      <NetworkLine name={name} />
    </Suspense>
  ) : null;
}
