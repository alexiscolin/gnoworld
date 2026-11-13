// The device's own views over the current place (ADR-0002 §2): the passport, the settings and the saved messages, each a dialog; this
// chunk comes when the first of them opens (DeviceViews.tsx), and the chat's door with the saved messages alone.
import { lazy, Suspense, useState } from "react";
// SavedDialog is a lazy component of its own: wrapped in a second lazy, React refuses it (a lazy must resolve to a function).
import { SavedDialog } from "../chat/index.ts";
import { PassportView } from "../passport/index.ts";
import { SettingsView } from "../settings/index.ts";
import { useDeviceView, type DeviceView } from "../../deviceViews.ts";

// The release of a command-line key has its own chunk, asked when it is opened (D13940).
const ReleaseDialog = lazy(async () => ({ default: (await import("../settings/index.ts")).ReleaseDialog }));

export function Views({ universe }: { universe: string }) {
  const [open, go] = useDeviceView();
  // Each view drawn from its first opening on, closed or open, so the dialog closes as a dialog does and its code is asked once.
  const [asked, setAsked] = useState<ReadonlySet<DeviceView>>(() => new Set());
  if (open !== undefined && !asked.has(open)) setAsked(new Set([...asked, open]));
  const close = () => {
    go(undefined);
  };
  return (
    <Suspense fallback={null}>
      {asked.has("passport") ? <PassportView universe={universe} open={open === "passport"} onClose={close} /> : null}
      {asked.has("settings") ? <SettingsView open={open === "settings"} onClose={close} /> : null}
      {asked.has("release") ? <ReleaseDialog open={open === "release"} onClose={close} /> : null}
      {asked.has("saved") ? <SavedDialog open={open === "saved"} onClose={close} /> : null}
    </Suspense>
  );
}
