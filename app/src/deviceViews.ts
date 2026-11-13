// The device's own views (ADR-0002 §2: /passport, /saved and /settings are "device-only views, shown as dialogs over the current place"):
// here a fragment of the place's address, #passport, #settings or #saved, so the place under the dialog stays as it is, the browser's back
// closes it, and a link opens it.
import { useLocation, useNavigate } from "react-router";

const DEVICE_VIEWS = ["passport", "settings", "saved", "release"] as const;
export type DeviceView = (typeof DEVICE_VIEWS)[number];

const viewOf = (hash: string): DeviceView | undefined => DEVICE_VIEWS.find((view) => hash === `#${view}`);

/** The device view open over the place, if any, and a way to open one or close it. */
export function useDeviceView(): [DeviceView | undefined, (view: DeviceView | undefined) => void] {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const open = viewOf(hash);
  const go = (view: DeviceView | undefined) => {
    // Opened, a step the browser's back undoes; closed, the step replaced, so back never opens it again.
    const done =
      view === undefined
        ? navigate({ pathname, search, hash: "" }, { replace: true, preventScrollReset: true })
        : navigate({ pathname, search, hash: view }, { replace: open !== undefined, preventScrollReset: true });
    Promise.resolve(done).catch(reportError);
  };
  return [open, go];
}
