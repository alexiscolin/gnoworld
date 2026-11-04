// Where the device's own views open over the place (#passport, #settings, #saved): their code comes when the first of them opens, never
// with the first screen.
import { lazy, Suspense, useState } from "react";
import { useDeviceView } from "../../deviceViews.ts";

const Views = lazy(async () => ({ default: (await import("./Views.tsx")).Views }));

export function DeviceViews({ universe }: { universe: string }) {
  const [open] = useDeviceView();
  const [asked, setAsked] = useState(false);
  if (open !== undefined && !asked) setAsked(true);
  return asked ? (
    <Suspense fallback={null}>
      <Views universe={universe} />
    </Suspense>
  ) : null;
}
