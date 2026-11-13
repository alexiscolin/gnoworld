// What the composer's field says of a draft (moved out of Composer.tsx, which grew past the lint's size): why it cannot
// go, what Tab completes, and the bytes left near the end.
import { markdown, mentionsRoom, MULTILINE_BYTES, MULTILINE_LINES, type Composed } from "@gnoworld/core";
import type { FieldProps } from "@gnoworld/ui";
import { plural } from "../../lib/plural.ts";

/** The bytes left from which the composer counts them. */
export const NEAR = 50;

const bytes = (count: number) => `${String(count)} ${count === 1 ? "byte" : "bytes"}`;

/** What the field says as @room stands in the draft: whether it notifies in this room (4f-n, decisions 2026-10-27, N3). */
export const ROOM_NOTIFIES = "@room notifies the members who keep notifications on for this room.";
export const ROOM_SILENT = "@room notifies no one in this room: it counts only in announcement and members rooms.";

/** What the field says of @room when the line holds it: whether it notifies in this room (`groups`), or nothing. */
export const roomHint = (composed: Composed, groups: boolean): string | undefined =>
  composed.kind === "line" && mentionsRoom(markdown(composed.text))
    ? groups
      ? ROOM_NOTIFIES
      : ROOM_SILENT
    : undefined;

// Why a draft is too long: the line of several (named, from 1), the line, or the message past its lines or its bytes.
function tooLong(composed: Extract<Composed, { kind: "long" | "tooBig" }>): string {
  if (composed.kind === "tooBig") {
    return composed.unit === "lines"
      ? `${plural(composed.over, "line")} too many: ${String(MULTILINE_LINES)} at most.`
      : `Too long by ${bytes(composed.over)}: ${String(MULTILINE_BYTES)} at most.`;
  }
  const by = `too long by ${bytes(composed.over)}`;
  return composed.line === undefined
    ? `Too long by ${bytes(composed.over)}.`
    : `Line ${String(composed.line)} is ${by}.`;
}

// Why a draft cannot go whatever the field is completing: half of an emoji, or a line or message too long.
function refusal(composed: Composed, multiline: boolean | undefined): string | undefined {
  const over = tooMany(composed, multiline);
  if (over > 0)
    return `${plural(over, "line")} too many: ${String(ALONE_LINES)} at most, as this chat sends one line at a time.`;
  if (composed.kind === "malformed") return "This text holds half of an emoji and cannot be sent. Delete it.";
  return composed.kind === "long" || composed.kind === "tooBig" ? tooLong(composed) : undefined;
}

/** What `said` knows beside the composed draft: the account's nick, which sizes a line's budget, and the draft as typed. */
export interface Context {
  nick?: string;
  draft?: string;
  /** What Tab completes the word being typed to. */
  /** Whether the connection sends a message of several lines whole (draft/multiline); else each line goes alone. */
  multiline?: boolean | undefined;
}

// A line at a time, the bot's 20 messages a minute hide the 21st (server/src/moderation/check.ts): so many lines at most.
const ALONE_LINES = 20;
const tooMany = (composed: Composed, multiline: boolean | undefined): number =>
  multiline === false && composed.kind === "lines" ? composed.lines.length - ALONE_LINES : 0;

/** An edit that composes to an action is refused, said in the field: Save would turn the message into one that nothing can
 * turn back, as Edit is for messages alone (CR4 of the room edit). */
export const editRefusal = (composed: Composed, editing: boolean): Pick<FieldProps, "error"> =>
  editing && composed.kind === "line" && composed.action ? { error: "An edit cannot be an action." } : {};

/** Whether the draft may go: a line or a message of lines, not past what the connection sends (F1719). */
export const sendable = (
  composed: Composed,
  multiline: boolean | undefined,
): composed is Extract<Composed, { kind: "line" | "lines" }> =>
  (composed.kind === "line" || composed.kind === "lines") && tooMany(composed, multiline) <= 0;

// The bytes left once few: a message of lines counts its tightest line's budget, about 440, when that is less than the
// message's 4096, and names the line (F1720).
function nearEnd(composed: Composed, { nick }: Context): string | undefined {
  if (!("left" in composed)) return undefined;
  const tight = composed.kind === "lines" && nick !== undefined ? composed.tightest : undefined;
  const line = tight !== undefined && tight.left < composed.left ? tight : undefined;
  const left = line?.left ?? composed.left;
  if (left >= NEAR) return undefined;
  return line === undefined ? `${bytes(left)} left.` : `Line ${String(line.line)}: ${bytes(left)} left.`;
}

// An action is one line: a break in the draft after /me is a space in what goes (F1718).
const actionOnly = (composed: Composed, { draft = "" }: Context): string | undefined =>
  composed.kind === "line" && composed.action && /[\r\n]/u.test(draft.trim())
    ? "An action is one line: its line breaks become spaces."
    : undefined;

/** How a poll is asked, said under a draft that asks one wrong. */
const POLL_FORM = "A poll is /poll A question? | an answer | another: two to nine answers.";

// What an unknown command is told: a poll asked wrong, how to ask one (polling.ts).
const unknownOf = (command: string): string =>
  command === "/poll" ? POLL_FORM : `${command} is not a command. /me sends an action.`;

/** What the field says of the draft: that it was not sent or is too long (a line of several named, a message past
 * its lines or bytes), an unknown command, or
 * help near the end or on an action; or nothing. */
export function said(
  composed: Composed,
  failed: boolean | string,
  context: Context = {},
): Pick<FieldProps, "error" | "help"> {
  const { multiline } = context;
  if (typeof failed === "string") return { error: failed };
  if (failed) return { error: "Not sent: the chat is not ready yet. Try again in a moment." };
  const refusing = refusal(composed, multiline);
  if (refusing !== undefined) return { error: refusing };
  if (composed.kind === "unknown") return { error: unknownOf(composed.command) };
  const help = nearEnd(composed, context) ?? actionOnly(composed, context);
  return help === undefined ? {} : { help };
}
