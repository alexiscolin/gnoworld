// A section of a list in the chat: the rooms' column and the worlds of a phone's drawer.
import { Disclosure } from "@gnoworld/ui";
import type { ReactNode } from "react";

/** A section of the column, as Discord's and Slack's: its name folds and unfolds it (ui's Disclosure, the section look), a control may stand at its end (a "+"). */
export function Folding({ name, action, children }: { name: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Disclosure look="section" title={name} open action={action}>
      {children}
    </Disclosure>
  );
}
