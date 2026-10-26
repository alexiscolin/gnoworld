// The direct messages a connection sent that Ergo has not answered yet (slice 4's 4e), by partner, oldest first.
// Ergo answers each in turn: an echo of one it delivered (echo-message), a 401 for one whose partner is not
// connected (irc/handlers.go:2533, v2.19.1). With its multiclient, another tab's line reaches this one as an echo
// does: an echo answers the line of its own text and kind alone.
import { dmOf, type Composed, type IrcMessage } from "@gnoworld/core";
import type { createAppStore } from "../../store/index.ts";

/** A line a draft was composed to, and sent. */
export type Sent = Extract<Composed, { kind: "line" }>;

interface Waiting {
  draft: string;
  text: string;
  action: boolean;
}

export interface Outbox {
  /** A line sent to `partner`, composed from `draft`. */
  sent: (partner: string, draft: string, line: Sent) => void;
  /** One of Ergo's lines on the connection, `me` my nick: my line to a partner, echoed, is answered; a 401 for a
   * partner refuses its oldest line, whose draft the store puts back. */
  heard: (message: IrcMessage, me: string) => void;
  /** A connection's end: nothing it sent is answered any more. */
  clear: () => void;
}

/** An empty outbox, a connection's, telling `store` of each line Ergo refuses. */
export function outbox(store: ReturnType<typeof createAppStore>): Outbox {
  const waiting = new Map<string, Waiting[]>();
  return {
    sent: (partner, draft, { text, action }) => {
      waiting.set(partner, [...(waiting.get(partner) ?? []), { draft, text, action }]);
    },
    heard: (message, me) => {
      const [, partner = ""] = message.params;
      const draft = message.command === "401" ? waiting.get(partner)?.shift()?.draft : undefined;
      if (draft !== undefined) store.getState().dmActions.refused(partner, draft);
      // My own line's echo: its partner is not its nick's (dmOf).
      const dm = dmOf(message, me);
      if (dm === undefined || dm.partner === dm.line.from) return;
      const queue = waiting.get(dm.partner) ?? [];
      const at = queue.findIndex(({ text, action }) => text === dm.line.text && action === (dm.line.kind === "action"));
      if (at !== -1) queue.splice(at, 1);
    },
    clear: () => {
      waiting.clear();
    },
  };
}
