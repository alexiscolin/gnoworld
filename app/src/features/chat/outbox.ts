// The direct messages a connection sent that Ergo has not answered yet (slice 4's 4e), each by the label it went with.
// Ergo answers a labeled line with that label (labeled-response, irc/commands.go:41, v2.19.1): its echo when it
// delivered it, a numeric when it refused it (401 its partner not connected, irc/handlers.go:2533; 477; 417), or a
// labeled-response batch of several lines (irc/responsebuffer.go:264-281). Another tab's line carries no label of ours.
import type { IrcMessage } from "@gnoworld/core";
import type { createAppStore } from "../../store/index.ts";

/** The lines waiting at once: one more drops the oldest, whose answer then puts nothing back. */
export const WAITING = 50;

/** What a line that is no message was: a delete of the line, or a reaction (4d's DM bar). */
type Act = { deleted: string } | { reacted: true };

interface Waiting {
  partner: string;
  draft: string;
  act: Act | undefined;
}

export interface Outbox {
  /** A line to `line.partner`, composed from `line.draft`, sent by `send` with the label it gives, the connection's own
   * count: whether it went, and then waits for Ergo's answer. An `act` (a delete, a reaction) has no draft to put back:
   * its refusal is told as the act's. */
  send: (line: { partner: string; draft: string; act?: Act }, send: (label: string) => boolean) => boolean;
  /** Ergo's answer to the line its `tags`' label names, its lines: a refusal among them puts its draft back. */
  answered: (tags: IrcMessage["tags"], messages: readonly IrcMessage[]) => void;
  /** A connection's end: nothing it sent is answered any more. */
  clear: () => void;
}

// A refusal: an error numeric, or a standard reply's FAIL.
const refusing = ({ command }: IrcMessage) => command === "FAIL" || /^[45]\d\d$/.test(command);

/** An empty outbox, a connection's, telling `store` of each line Ergo refuses. */
export function outbox(store: ReturnType<typeof createAppStore>): Outbox {
  const waiting = new Map<string, Waiting>();
  let count = 0;
  return {
    send: ({ partner, draft, act }, send) => {
      count += 1;
      const label = String(count);
      if (!send(label)) return false;
      waiting.set(label, { partner, draft, act });
      const [oldest] = waiting.keys();
      if (waiting.size > WAITING && oldest !== undefined) waiting.delete(oldest);
      return true;
    },
    answered: (tags, messages) => {
      const label = tags.get("label") ?? "";
      const line = waiting.get(label);
      if (line === undefined) return;
      waiting.delete(label);
      const refusal = messages.find(refusing);
      if (refusal === undefined) return;
      const { dmActions } = store.getState();
      if (line.act === undefined) dmActions.refused(line.partner, line.draft, refusal.command === "401");
      else dmActions.actRefused(line.partner, line.act);
    },
    clear: () => {
      waiting.clear();
    },
  };
}
