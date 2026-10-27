// What the link sends for the account (slice 4's 4c to 4e, moved out of link.ts): its lines to a room or to another
// account, a delete, a reaction; each an account's alone, in a room Ergo says it is in. Whether each went.
import { compose, isTagMsgid, reactionLine, type Reacting } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import { isCommandMsgid } from "./history.ts";
import type { Outbox } from "./outbox.ts";
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

  constructor(host: Host) {
    this.#host = host;
  }

  say(room: string, draft: string, reply?: string): boolean {
    if (reply !== undefined && !isTagMsgid(reply)) return false;
    const line = this.#lineTo(room, draft, () => this.#host.inside.has(room));
    const tags = reply === undefined ? "" : `@+reply=${reply} `;
    const went = line !== undefined && this.#host.ergo()?.send(`${tags}${line}`) === true;
    if (went) this.#host.typing.ended(room);
    return went;
  }

  // Labeled, so Ergo's answer names it (CR1); the label rides within the bytes compose leaves for Ergo's relay.
  sayTo(partner: string, draft: string): boolean {
    const line = this.#lineTo(partner, draft, (me) => me !== partner && Address.safeParse(partner).success);
    if (line === undefined) return false;
    return this.#host.outbox.send(
      partner,
      draft,
      (label) => this.#host.ergo()?.send(`@label=${label} ${line}`) === true,
    );
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

  // The line a draft to `target` composes to, on an account's connection when `allowed` lets it, given my nick.
  #lineTo(target: string, draft: string, allowed: (me: string) => boolean): string | undefined {
    const me = this.#host.ergo()?.nick();
    if (this.#host.guest() || me === undefined || !allowed(me)) return undefined;
    const composed = compose(target, draft, me);
    return composed.kind === "line" ? composed.line : undefined;
  }
}
