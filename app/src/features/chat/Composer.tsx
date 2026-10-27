// The composer (slice 4's 4c): Markdown to the room in view, sent with Enter or Send, Shift+Enter adding a line (a
// message of several lines goes as one, 4096 bytes and 40 lines at most: draft/multiline); its caller shows
// it to an account alone, a room letting accounts alone speak (+M). The design system's field holds the line and
// says what keeps it from going (too long for IRC's 510 bytes, a command it does not know, the chat away) or the
// bytes left near the end, or what Tab completes the word being typed to (a command, a room, an account). A format
// bar wraps the selection in Markdown's marks; the line shows below as it reads.
import { COMMANDS, compose, MULTILINE_BYTES, MULTILINE_LINES, type Composed } from "@gnoworld/core";
import { Button, Cluster, Field, IconButton, Sidebar, Stack, type FieldProps, type IconName } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react";
import { completed, completions, type Completion } from "./complete.ts";
import { formatted, type Edit, type Format } from "./format.ts";
import { Message } from "./Message.tsx";
import { peopleOf, roomLabel, shortAddress } from "./names.ts";
import styles from "./Composer.module.css";

/** The bytes left from which the composer counts them. */
export const NEAR = 50;

const BAR: readonly { format: Format; icon: IconName; label: string }[] = [
  { format: "bold", icon: "bold", label: "Bold" },
  { format: "italic", icon: "italic", label: "Italic" },
  { format: "strike", icon: "strikethrough", label: "Strikethrough" },
  { format: "code", icon: "code", label: "Code" },
  { format: "link", icon: "link", label: "Link" },
  { format: "quote", icon: "quote", label: "Quote" },
  { format: "bulleted", icon: "list-bulleted", label: "Bulleted list" },
  { format: "numbered", icon: "list-numbered", label: "Numbered list" },
];

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

/** What the field says of the draft: that it was not sent or is too long (a line of several named, a message past
 * its lines or bytes), what Tab completes (a command not yet typed whole being no error), an unknown command, or
 * help near the end; or, said of nothing else, that Shift+Enter adds a line. */
export function said(composed: Composed, failed: boolean, completion?: Completion): Pick<FieldProps, "error" | "help"> {
  if (failed) return { error: "Not sent: the chat is not in this room yet. Try again in a moment." };
  if (composed.kind === "long" || composed.kind === "tooBig") return { error: tooLong(composed) };
  if (completion !== undefined) {
    const [first = "", ...rest] = completion.options.map(named);
    return { help: `Tab completes ${first}${rest.length === 0 ? "" : `; also ${rest.join(", ")}`}.` };
  }
  if (composed.kind === "unknown") return { error: `${composed.command} is not a command. /me sends an action.` };
  if ("left" in composed && composed.left < NEAR) return { help: `${bytes(composed.left)} left.` };
  return {};
}

/** The draft as the room will read it, an action as one, the account's own mention apart, a member's shortened (F812),
 * out of reach of the keyboard and of a screen reader (the field says it already); nothing of a line that cannot go. */
export function Preview({
  composed,
  me,
  members,
}: {
  composed: Composed;
  me?: string | undefined;
  members?: ReadonlySet<string> | undefined;
}) {
  if (composed.kind !== "line" && composed.kind !== "lines") return null;
  return (
    <div className={styles["preview"]} inert>
      {composed.kind === "line" && composed.action ? "* " : null}
      <Message text={composed.text} me={me} members={members} />
    </div>
  );
}

// The format bar: each format of BAR, named, applied to the box's selection.
function FormatBar({ onFormat }: { onFormat: (format: Format) => void }) {
  return (
    <div role="group" aria-label="Format">
      <Cluster space="3xs">
        {BAR.map((tool) => (
          <IconButton
            key={tool.format}
            icon={tool.icon}
            label={tool.label}
            size="s"
            emphasis="plain"
            onClick={() => {
              onFormat(tool.format);
            }}
          />
        ))}
      </Cluster>
    </div>
  );
}

export interface ComposerProps {
  room: string;
  /** The account's nick, which Ergo puts before each line it relays: the line's room is what it leaves. */
  nick: string;
  /** The world's rooms by label, and the room's members, whose other accounts a word after `@` completes to. */
  rooms: readonly string[];
  members: readonly string[];
  /** Sends the draft as composed; whether it went. */
  onSay: (composed: Composed) => boolean;
  /** Where the draft starts: the room's, kept on the device (4d). */
  draft?: string | undefined;
  /** Each change of the draft, for the device to keep; a line sent leaves it blank. */
  onDraft?: ((draft: string) => void) | undefined;
}

export function Composer({ room, nick, rooms, members, onSay, draft: kept = "", onDraft }: ComposerProps) {
  const [draft, setDraft] = useState(kept);
  // Each change of the draft, the device told at once: a render alone (a line arriving) writes nothing.
  const change = (next: string) => {
    setDraft(next);
    onDraft?.(next);
  };
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The selection an edit leaves, put back in the box once it shows the new draft.
  const selectionRef = useRef<Edit>(undefined);
  const label = roomLabel(room);
  const composed = compose(room, draft, nick);
  // The room's accounts are sorted out of its members only while a word after `@` is typed; read apart, the mention
  // alone, not each key, is what the compiler recomputes them on (F793).
  const mentioning = /(^|\s)@\S*$/u.test(draft);
  const people = mentioning ? peopleOf(members, nick) : [];
  const completion = completions(draft, { commands: COMMANDS, rooms, people });
  // Said of nothing else, the box says how to add a line.
  const note = said(composed, failed, completion);
  const known = new Set(members);
  const box = () => formRef.current?.querySelector("textarea") ?? undefined;
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (selection === undefined) return;
    selectionRef.current = undefined;
    box()?.focus();
    box()?.setSelectionRange(selection.start, selection.end);
  }, [draft]);
  // An edit of the format bar or of a completion: the new draft, its selection, and no line not sent any more.
  const apply = (next: Edit) => {
    selectionRef.current = next;
    change(next.text);
    setFailed(false);
  };
  const format = (kind: Format) => {
    const start = box()?.selectionStart ?? draft.length;
    apply(formatted({ text: draft, start, end: box()?.selectionEnd ?? start }, kind));
  };
  // Tab in the box takes the first completion while the caret ends the draft; else, and anywhere else in the form,
  // it moves on, as it always does.
  const complete = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Tab" || event.shiftKey || completion === undefined) return;
    const input = box();
    if (event.target !== input || input.selectionStart !== draft.length) return;
    event.preventDefault();
    apply(completed(draft, completion));
  };
  const send = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (composed.kind !== "line" && composed.kind !== "lines") return;
    const went = onSay(composed);
    setFailed(!went);
    if (went) change("");
  };
  return (
    <form ref={formRef} aria-label={`Write in ${label}`} onSubmit={send} onKeyDown={complete}>
      <Stack space="2xs">
        <FormatBar onFormat={format} />
        <Sidebar side="end" space="2xs">
          <Field
            kind="lines"
            label={`Message ${label}`}
            value={draft}
            onChange={(value) => {
              change(value);
              setFailed(false);
            }}
            {...("error" in note || "help" in note ? note : { help: "Shift+Enter adds a line." })}
          />
          <Button type="submit" disabled={composed.kind !== "line" && composed.kind !== "lines"}>
            Send
          </Button>
        </Sidebar>
        <Preview composed={composed} me={nick} members={known} />
      </Stack>
    </form>
  );
}
