// The composer (slice 4's 4c): one line of Markdown to the room in view, sent with Enter or Send; its caller shows
// it to an account alone, a room letting accounts alone speak (+M). The design system's field holds the line and
// says what keeps it from going (too long for IRC's 510 bytes, a command it does not know, the chat away) or the
// bytes left near the end, or what Tab completes the word being typed to (a command, a room, an account). A format
// bar wraps the selection in Markdown's marks; the line shows below as it reads.
import { COMMANDS, compose, type Composed } from "@gnoworld/core";
import { Button, Cluster, Field, IconButton, Sidebar, Stack, type FieldProps, type IconName } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from "react";
import { completed, completions, type Completion } from "./complete.ts";
import { formatted, type Edit, type Format } from "./format.ts";
import { Message } from "./Message.tsx";
import { roomLabel, shortAddress } from "./names.ts";
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

/** What the field says of the line: that it was not sent or is too long, what Tab completes (a command not yet
 * typed whole being no error), an unknown command, or help near the end; or nothing. */
export function said(composed: Composed, failed: boolean, completion?: Completion): Pick<FieldProps, "error" | "help"> {
  if (failed) return { error: "Not sent: the chat is not in this room yet. Try again in a moment." };
  if (composed.kind === "long") return { error: `Too long by ${bytes(composed.over)}.` };
  if (completion !== undefined) {
    const [first = "", ...rest] = completion.options.map(named);
    return { help: `Tab completes ${first}${rest.length === 0 ? "" : `; also ${rest.join(", ")}`}.` };
  }
  if (composed.kind === "unknown") return { error: `${composed.command} is not a command. /me sends an action.` };
  if (composed.kind === "line" && composed.left < NEAR) return { help: `${bytes(composed.left)} left.` };
  return {};
}

/** The line as it will read, out of reach of the keyboard and of a screen reader: the field says it already. */
export function Preview({ text }: { text: string }) {
  return (
    <div className={styles["preview"]} inert>
      <Message text={text} />
    </div>
  );
}

export interface ComposerProps {
  room: string;
  /** The account's nick, which Ergo puts before each line it relays: the line's room is what it leaves. */
  nick: string;
  /** The world's rooms by label, and the room's other accounts by address, which the word being typed completes to. */
  rooms: readonly string[];
  people: readonly string[];
  /** Sends the draft; whether it went. */
  onSay: (draft: string) => boolean;
}

export function Composer({ room, nick, rooms, people, onSay }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The selection an edit leaves, put back in the box once it shows the new draft.
  const selectionRef = useRef<Edit>(undefined);
  const label = roomLabel(room);
  const composed = compose(room, draft, nick);
  const completion = completions(draft, { commands: COMMANDS, rooms, people });
  const box = () => formRef.current?.querySelector("input") ?? undefined;
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
    setDraft(next.text);
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
    if (composed.kind !== "line") return;
    const went = onSay(draft);
    setFailed(!went);
    if (went) setDraft("");
  };
  return (
    <form ref={formRef} aria-label={`Write in ${label}`} onSubmit={send} onKeyDown={complete}>
      <Stack space="2xs">
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
                  format(tool.format);
                }}
              />
            ))}
          </Cluster>
        </div>
        <Sidebar side="end" space="2xs">
          <Field
            label={`Message ${label}`}
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setFailed(false);
            }}
            {...said(composed, failed, completion)}
          />
          <Button type="submit" disabled={composed.kind !== "line"}>
            Send
          </Button>
        </Sidebar>
        {draft.trim() === "" ? null : <Preview text={draft} />}
      </Stack>
    </form>
  );
}
