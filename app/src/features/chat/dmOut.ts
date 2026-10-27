// A direct message's lines as the link sends them (slice 4's 4e, and 4d's DM bar), moved out of link.ts for the lint's
// sizes: a line to an account's nick, labelled so Ergo's answer to it is known, from an account's connection alone.
import { compose, isTagMsgid, reactionLine, type Reacting } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import type { createAppStore } from "../../store/index.ts";
import { isCommandMsgid } from "./history.ts";
import type { Outbox } from "./outbox.ts";

/** What the link lends a direct message's lines: its connection, the key of its session ("guest" or an address), its
 * outbox and the store. */
export interface DmOut {
  ergo: Ergo | undefined;
  key: string | undefined;
  outbox: Outbox;
  store: ReturnType<typeof createAppStore>;
}

const out = (o: DmOut, line: string): boolean => o.ergo?.send(line) === true;

/** The line a draft to `target` composes to on an account's connection when `allowed` lets it, given my nick. */
export function lineTo(
  o: DmOut,
  { target, draft }: { target: string; draft: string },
  allowed: (me: string) => boolean,
): string | undefined {
  const me = o.ergo?.nick();
  if (o.key === "guest" || me === undefined || !allowed(me)) return undefined;
  const composed = compose(target, draft, me);
  return composed.kind === "line" ? composed.line : undefined;
}

// Another account's address, never mine, from an account's connection that is up.
const mayAct = (o: DmOut, partner: string) => {
  const me = o.ergo?.nick();
  return o.key !== "guest" && me !== undefined && me !== partner && Address.safeParse(partner).success;
};

/** A draft to `partner`, tagged +reply with the msgid it answers or +gnoworld/edit (our convention, decision 156) with the
 * one it corrects, a msgid a tag carries. Whether it went. */
export function sayTo(
  o: DmOut,
  to: { partner: string; draft: string },
  tags: { reply?: string; edit?: string } = {},
): boolean {
  const { partner, draft } = to;
  const { reply, edit } = tags;
  if ((reply !== undefined && !isTagMsgid(reply)) || (edit !== undefined && !isTagMsgid(edit))) return false;
  const line = lineTo(o, { target: partner, draft }, (me) => me !== partner && Address.safeParse(partner).success);
  if (line === undefined) return false;
  const marks = [
    ...(reply === undefined ? [] : [`+reply=${reply}`]),
    ...(edit === undefined ? [] : [`+gnoworld/edit=${edit}`]),
  ];
  return o.outbox.send({ partner, draft }, (label) => out(o, `@${[`label=${label}`, ...marks].join(";")} ${line}`));
}

/** A reaction to a line of the conversation, or its take-back. Whether it went. */
export function reactTo(o: DmOut, partner: string, reaction: Reacting): boolean {
  if (!mayAct(o, partner)) return false;
  const send = (label: string) => {
    const line = reactionLine(reaction, partner, label);
    return line !== undefined && out(o, line);
  };
  return o.outbox.send({ partner, draft: "", act: { reacted: true } }, send);
}

/** A REDACT of the line and one for each correction of mine to it, the line's refusal said for the line. Whether the
 * line's went. */
export function redactIn(o: DmOut, partner: string, id: string): boolean {
  if (!mayAct(o, partner) || !isCommandMsgid(id)) return false;
  const me = o.ergo?.nick();
  const edits = (o.store.getState().dms[partner] ?? [])
    .filter((line) => line.edits === id && line.account === me && isCommandMsgid(line.id))
    .map((line) => line.id);
  const redact = (target: string) =>
    o.outbox.send({ partner, draft: "", act: { deleted: id } }, (label) =>
      out(o, `@label=${label} REDACT ${partner} ${target}`),
    );
  const went = redact(id);
  if (went) for (const edit of edits) redact(edit);
  return went;
}
