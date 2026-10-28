// What the direct message in view lets its reader do through the page's link (slice 4's 4d, the DM bar), as roomActs does
// for a room: built from the partner and the link alone.
import type { Reacting } from "@gnoworld/core";
import type { RefObject } from "react";
import type { ChatLink } from "./link.ts";

export interface DmActs {
  onDelete: (id: string) => boolean;
  onDismiss: () => void;
  onReact: (reaction: Reacting) => boolean;
}

// What Ergo refused before is told no more once the act is tried again: its answer, or none, says the rest (CR4).
export function dmActs(
  link: RefObject<ChatLink | undefined>,
  partner: string,
  dismissed: (partner: string) => void,
): DmActs {
  return {
    onDelete: (id) => {
      dismissed(partner);
      return link.current?.redactIn(partner, id) ?? false;
    },
    onDismiss: () => {
      dismissed(partner);
    },
    onReact: (reaction) => {
      dismissed(partner);
      return link.current?.reactTo(partner, reaction) ?? false;
    },
  };
}
