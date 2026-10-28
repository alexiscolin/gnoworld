// A direct message's lines as the link sends them (slice 4's 4e, and 4d's DM bar), moved out of link.ts for the lint's
// sizes: a line to an account's nick, labelled so Ergo's answer to it is known, from an account's connection alone.
import { isTagMsgid, reactionLine, type Composed, type Line, type Reacting } from "@gnoworld/core";
import { Address } from "@gnoworld/schemas";
import type { Ergo } from "../../lib/ergo/ergo.ts";
import type { createAppStore } from "../../store/index.ts";
import { isCommandMsgid } from "./history.ts";
import type { Outbox } from "./outbox.ts";
import { send } from "./outgoing.ts";
import { reactLabel } from "./reacting.ts";

/** What the link lends a direct message's lines: its connection, the key of its session ("guest" or an address), its
 * outbox and the store; `ref` gives the next batch's reference (draft/multiline), one a connection's own. */
export interface DmOut {
  ergo: Ergo | undefined;
  key: string | undefined;
  outbox: Outbox;
  store: ReturnType<typeof createAppStore>;
  ref: () => string;
}

const out = (o: DmOut, line: string): boolean => o.ergo?.send(line) === true;

// What the composer composed for `target`, sent with `tags` on an account's connection once Ergo gave its nick.
function sendTo(o: DmOut, to: { target: string; composed: Composed }, tags: readonly string[]): boolean {
  if (o.key === "guest" || o.ergo?.nick() === undefined) return false;
  return send(o.ergo, { room: to.target, composed: to.composed, tags: tags.join(";"), ref: o.ref() });
}

// Another account's address, never mine, from an account's connection that is up.
const mayAct = (o: DmOut, partner: string) => {
  const me = o.ergo?.nick();
  return o.key !== "guest" && me !== undefined && me !== partner && Address.safeParse(partner).success;
};

/** The tags a reply (+reply, with the msgid it answers) or a correction (+gnoworld/edit, our convention, decision 156, with the
 * one it corrects) goes with, a msgid a tag carries; none at all when a msgid cannot ride in a tag. A room's lines and a
 * direct message's go with the same. */
function marksOf({ reply, edit }: { reply?: string | undefined; edit?: string | undefined }): string[] | undefined {
  if ((reply !== undefined && !isTagMsgid(reply)) || (edit !== undefined && !isTagMsgid(edit))) return undefined;
  return [
    ...(reply === undefined ? [] : [`+reply=${reply}`]),
    ...(edit === undefined ? [] : [`+gnoworld/edit=${edit}`]),
  ];
}

/** The msgids of the corrections of mine to the line `id`, in the order the conversation holds them: a correction is a line of
 * its own, which a REDACT of its line does not take, and Ergo lets an author delete its own lines alone. Only the
 * lines the store holds are looked through: a correction it never heard is not named (R2's ceiling). */
function correctionsOf(lines: readonly Line[], me: string | undefined, id: string): string[] {
  return lines
    .filter((line) => line.edits === id && line.account === me && isCommandMsgid(line.id))
    .map((line) => line.id);
}

/** A delete's REDACTs, in the one order a room and a conversation share: each correction first, the line's last, so a
 * REDACT of the line that is refused never leaves the words it was corrected from showing alone (the red pass's R1, CR2).
 * Whether the line's went. */
function redactAll(edits: readonly string[], id: string, redact: (target: string) => boolean): boolean {
  for (const edit of edits) redact(edit);
  return redact(id);
}

/** What the composer composed for `partner`, tagged +reply with the msgid it answers or +gnoworld/edit with the one it
 * corrects, a msgid a tag carries; `draft` is what its writer typed, which Ergo's refusal puts back. Whether it went. */
export function sayTo(
  o: DmOut,
  to: { partner: string; composed: Composed; draft: string },
  tags: { reply?: string; edit?: string } = {},
): boolean {
  const { partner, composed, draft } = to;
  const marks = marksOf(tags);
  if (marks === undefined || !mayAct(o, partner)) return false;
  const kept = marks.length === 0 ? {} : { tags };
  return o.outbox.send({ partner, draft, ...kept }, (label) =>
    sendTo(o, { target: partner, composed }, [`label=${label}`, ...marks]),
  );
}

/** What the composer composed for the room `to.room`, which `to.inside` says the page is in, tagged as a reply or a
 * correction; whether it went. */
export function speakIn(
  o: DmOut,
  to: { room: string; composed: Composed; inside: boolean },
  tags: { reply?: string | undefined; edit?: string | undefined },
): boolean {
  const marks = marksOf(tags);
  return marks !== undefined && to.inside && sendTo(o, { target: to.room, composed: to.composed }, marks);
}

/** A reaction to a line of a room the page is in (`inside`), or its take-back; an account's alone. Whether it went. */
export function reactInRoom(o: DmOut, to: { room: string; inside: boolean }, reaction: Reacting): boolean {
  const line = reactionLine(reaction, to.room, reactLabel(to.room));
  return line !== undefined && o.key !== "guest" && to.inside && out(o, line);
}

/** A REDACT of each correction of mine to a line of a room the page is in (`inside`), which the line's does not take: a
 * deleted line would stay as its newest correction, for every reader; then the line's (redactAll). Whether it went. */
export function redactFrom(o: DmOut, to: { room: string; id: string; inside: boolean }): boolean {
  const { room, id } = to;
  if (o.key === "guest" || !to.inside || !isCommandMsgid(id)) return false;
  const held = o.store.getState().chat.rooms[room]?.lines ?? [];
  return redactAll(correctionsOf(held, o.ergo?.nick(), id), id, (target) => out(o, `REDACT ${room} ${target}`));
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

/** A REDACT of each correction of mine to the line and the line's (redactAll), the line's refusal said for the line.
 * Whether the line's went. */
export function redactIn(o: DmOut, partner: string, id: string): boolean {
  if (!mayAct(o, partner) || !isCommandMsgid(id)) return false;
  const edits = correctionsOf(o.store.getState().dms[partner] ?? [], o.ergo?.nick(), id);
  const redact = (target: string) =>
    o.outbox.send({ partner, draft: "", act: { deleted: id } }, (label) =>
      out(o, `@label=${label} REDACT ${partner} ${target}`),
    );
  return redactAll(edits, id, redact);
}
