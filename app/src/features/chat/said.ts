// What the composer's field says of a draft (moved out of Composer.tsx, which grew past the lint's size): why it cannot
// go, what Tab completes, the bytes left near the end, and the hint of how to add a line.
import { LINE_BYTES, MULTILINE_BYTES, MULTILINE_LINES, relayOf, type Composed } from "@gnoworld/core";
import type { FieldProps } from "@gnoworld/ui";
import type { Completion } from "./complete.ts";
import { shortAddress } from "./names.ts";

// What the field says while it has nothing else to say: the room is told of the typing from the first key (4f; its
// switch waits for slice 8's settings, docs/decisions.md 2026-10-26), which the writer reads here (UX review's U9).
const TELLS = "People in this room see when you type.";
const ADDS_LINE = "Shift+Enter adds a line.";
const ADDS_LINE_TOUCH = "Enter adds a line; Send sends it.";

/** The bytes left from which the composer counts them. */
export const NEAR = 50;

const bytes = (count: number) => `${String(count)} ${count === 1 ? "byte" : "bytes"}`;

// An option as the help names it: an account by its short address.
const named = (option: string) => (option.startsWith("@") ? `@${shortAddress(option.slice(1))}` : option);

const plural = (count: number, unit: string) => `${String(count)} ${unit}${count === 1 ? "" : "s"}`;

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
function refusal(composed: Composed): string | undefined {
  if (composed.kind === "malformed") return "This text holds half of an emoji and cannot be sent. Delete it.";
  return composed.kind === "long" || composed.kind === "tooBig" ? tooLong(composed) : undefined;
}

/** What `said` knows beside the composed draft: the account's nick, which sizes a line's budget, and the draft as typed. */
export interface Context {
  nick?: string;
  draft?: string;
  /** What Tab completes the word being typed to. */
  completion?: Completion | undefined;
}

// Of a message of lines, the one with the fewest bytes left in IRC's budget (named from 1) and what it has left.
function tightest(lines: readonly string[], nick: string): { line: number; left: number } {
  const budget = LINE_BYTES - relayOf(nick);
  const lefts = lines.map((line) => budget - new TextEncoder().encode(line).length);
  const left = Math.min(...lefts);
  return { line: lefts.indexOf(left) + 1, left };
}

// The bytes left once few: a message of lines counts its tightest line's budget, about 440, when that is less than the
// message's 4096, and names the line (F1720).
function nearEnd(composed: Composed, { nick }: Context): string | undefined {
  if (!("left" in composed)) return undefined;
  const tight = composed.kind === "lines" && nick !== undefined ? tightest(composed.lines, nick) : undefined;
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

/** What the field says of the draft: that it was not sent or is too long (a line of several named, a message past
 * its lines or bytes), what Tab completes (a command not yet typed whole being no error), an unknown command, or
 * help near the end or on an action; or nothing. */
export function said(composed: Composed, failed: boolean, context: Context = {}): Pick<FieldProps, "error" | "help"> {
  const { completion } = context;
  if (failed) return { error: "Not sent: the chat is not ready yet. Try again in a moment." };
  const refusing = refusal(composed);
  if (refusing !== undefined) return { error: refusing };
  if (completion !== undefined) {
    const [first = "", ...rest] = completion.options.map(named);
    return { help: `Tab completes ${first}${rest.length === 0 ? "" : `; also ${rest.join(", ")}`}.` };
  }
  if (composed.kind === "unknown") return { error: `${composed.command} is not a command. /me sends an action.` };
  const help = nearEnd(composed, context) ?? actionOnly(composed, context);
  return help === undefined ? {} : { help };
}

// Nothing else to say, no error either: how to add a line (a touch screen's keyboard has no Shift), and the disclosure
// to a room's writer; a direct message tells no typing (4e).
export const withHint = (says: ReturnType<typeof said>, direct: boolean, coarse: boolean): ReturnType<typeof said> => {
  if (says.error !== undefined || says.help !== undefined) return says;
  const adds = coarse ? ADDS_LINE_TOUCH : ADDS_LINE;
  return { help: direct ? adds : `${TELLS} ${adds}` };
};
