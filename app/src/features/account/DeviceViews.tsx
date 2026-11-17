// Where the device's own views open over the place (#passport, #settings, #saved): their code comes when the first of them opens, never
// with the first screen.
import { lazy, Suspense, useEffect, useEffectEvent, useState } from "react";
import { useDeviceView } from "../../deviceViews.ts";
import { onAsked } from "../../pageAsks.ts";

const Views = lazy(async () => ({ default: (await import("./Views.tsx")).Views }));

export function DeviceViews({ universe }: { universe: string }) {
  const [open, go] = useDeviceView();
  const [asked, setAsked] = useState(false);
  // Get started's "Log in with gnokey" (login/GetStarted.tsx) opens the command line's login, a view of the device.
  const keyLogin = useEffectEvent(() => {
    go("key-login");
  });
  useEffect(() => {
    const stop = new AbortController();
    onAsked("key-login", keyLogin, stop.signal);
    return () => {
      stop.abort();
    };
  }, []);
  if (open !== undefined && !asked) setAsked(true);
  return asked ? (
    <Suspense fallback={null}>
      <Views universe={universe} />
    </Suspense>
  ) : null;
}
