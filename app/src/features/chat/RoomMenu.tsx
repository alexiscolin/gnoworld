// One choice of what the room's name opens: its label, its control and its help.
import { Stack } from "@gnoworld/ui";
import type { ReactNode } from "react";

/** One of the menu's choices: its name in the label's type, its control, and what it does in the small muted type under it. */
export function Setting({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <Stack space="xs" as="section">
      <h3 className="label">{label}</h3>
      {children}
      {help === undefined ? null : <div className="meta">{help}</div>}
    </Stack>
  );
}
