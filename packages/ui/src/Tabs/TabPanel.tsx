import type { ReactNode } from "react";
import { panelId, tabId } from "./Tabs.tsx";

/** The panel of the tab `tab` of Tabs with the same `id`, named by that tab, coming in as it mounts. */
export function TabPanel({
  id,
  tab,
  hidden,
  children,
}: {
  id: string;
  tab: string;
  hidden?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div role="tabpanel" id={panelId(id, tab)} aria-labelledby={tabId(id, tab)} className="enter" hidden={hidden}>
      {children}
    </div>
  );
}
