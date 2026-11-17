// The frame of a place's plate: the one Panel and Panel.Body the page draws its plate in (routes/placeFrame.tsx) and the phone's "Its page"
// sheet draws it in (PlaceSheet.tsx), so the plate's container, its narrow rules, its hero and its scroller are the same in both.
import type { ReactNode } from "react";
import { Panel, Stack } from "@gnoworld/ui";

export function PlateFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Panel label={label} look="plate" caption="gnoworld · hub atlas">
      <Panel.Body>
        <Stack>{children}</Stack>
      </Panel.Body>
    </Panel>
  );
}
