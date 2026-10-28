// What the link sends for the account (slice 4's 4c to 4e, moved out of link.ts): its lines to a room or to another
// account, a delete, a reaction; each an account's alone, in a room Ergo says it is in. Whether each went.
import { isTagMsgid, reactionLine, type Composed, type Reacting } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import { isCommandMsgid } from "./history.ts";
import type { Outbox } from "./outbox.ts";
import { send } from "./outgoing.ts";
import { reactLabel } from "./reacting.ts";
import type { TypingOut } from "./telling.ts";

/** What the link lends: the connection, whether it is a guest's, the rooms Ergo said I am in, and the ways out. */
export interface Host {
  ergo: () => Ergo | undefined;
  guest: () => boolean;
  inside: ReadonlySet<string>;
  outbox: Outbox;
  typing: TypingOut;
}

export class Sending {
  readonly #host: Host;
  // The next batch's reference, one a connection's own: letters and digits, as Ergo takes them (irc/utils/args.go).
  #batches = 0;

  constructor(host: Host) {
    this.#host = host;
  }

  say(room: string, composed: Composed, reply?: string): boolean {
    if (reply !== undefined && !isTagMsgid(reply)) return false;
    const went =
      this.#host.inside.has(room) && this.#sendTo(room, composed, reply === undefined ? "" : `+reply=${reply}`);
    if (went) this.#host.typing.ended(room);
    return went;
  }

  // Labeled, so Ergo's answer names it (CR1); the label rides within the bytes compose leaves for Ergo's relay. The
  // draft is what the outbox puts back if Ergo refuses the message.
  sayTo(partner: string, composed: Composed, draft: string): boolean {
    if (partner === this.#host.ergo()?.nick() || !Address.safeParse(partner).success) return false;
    return this.#host.outbox.send(partner, draft, (label) => this.#sendTo(partner, composed, `label=${label}`));
  }

  redact(room: string, id: string): boolean {
    const allowed = !this.#host.guest() && this.#host.inside.has(room) && isCommandMsgid(id);
    return allowed && this.#host.ergo()?.send(`REDACT ${room} ${id}`) === true;
  }

  react(room: string, reaction: Reacting): boolean {
    const line = reactionLine(reaction, room, reactLabel(room));
    return (
      line !== undefined && !this.#host.guest() && this.#host.inside.has(room) && this.#host.ergo()?.send(line) === true
    );
  }

  // What the composer composed for `target`, sent on an account's connection once Ergo gave its nick.
  #sendTo(target: string, composed: Composed, tags: string): boolean {
    const ergo = this.#host.ergo();
    if (this.#host.guest() || ergo?.nick() === undefined) return false;
    return send(ergo, { room: target, composed, tags, ref: `ml${(this.#batches++).toString(36)}` });
  }
}
