// What the composer's field says of a draft (moved out of Composer.tsx, which grew past the lint's size): why it cannot
// go, what Tab completes, the bytes left near the end, and the hint of how to add a line.
import { MULTILINE_BYTES, MULTILINE_LINES, type Composed } from "@gnoworld/core";
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

/** What the field says of the draft: that it was not sent or is too long (a line of several named, a message past
 * its lines or bytes), what Tab completes (a command not yet typed whole being no error), an unknown command, or
 * help near the end; or nothing. */
export function said(composed: Composed, failed: boolean, completion?: Completion): Pick<FieldProps, "error" | "help"> {
  if (failed) return { error: "Not sent: the chat is not ready yet. Try again in a moment." };
  const refusing = refusal(composed);
  if (refusing !== undefined) return { error: refusing };
  if (completion !== undefined) {
    const [first = "", ...rest] = completion.options.map(named);
    return { help: `Tab completes ${first}${rest.length === 0 ? "" : `; also ${rest.join(", ")}`}.` };
  }
  if (composed.kind === "unknown") return { error: `${composed.command} is not a command. /me sends an action.` };
  if ("left" in composed && composed.left < NEAR) return { help: `${bytes(composed.left)} left.` };
  return {};
}

// Nothing else to say, no error either: how to add a line (a touch screen's keyboard has no Shift), and the disclosure
// to a room's writer; a direct message tells no typing (4e).
export const withHint = (says: ReturnType<typeof said>, direct: boolean, coarse: boolean): ReturnType<typeof said> => {
  if (says.error !== undefined || says.help !== undefined) return says;
  const adds = coarse ? ADDS_LINE_TOUCH : ADDS_LINE;
  return { help: direct ? adds : `${TELLS} ${adds}` };
};
