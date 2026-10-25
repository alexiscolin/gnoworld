// The composer (slice 4's 4c): one line of Markdown to the room in view, sent with Enter or Send; its caller shows
// it to an account alone, a room letting accounts alone speak (+M). The design system's field holds the line and
// says what keeps it from going (too long for IRC's 510 bytes, a command it does not know, the chat away) or the
// bytes left near the end. A format bar wraps the selection in Markdown's marks; the line shows below as it reads.
import { compose, type Composed } from "@gnoworld/core";
import { Button, Cluster, Field, IconButton, Sidebar, Stack, type FieldProps, type IconName } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import { formatted, type Format } from "./format.ts";
import { Message } from "./Message.tsx";
import { roomLabel } from "./names.ts";
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

/** What the field says of the line: an error that keeps it from going, or help near the end, or nothing. */
export function said(composed: Composed, failed: boolean): Pick<FieldProps, "error" | "help"> {
  if (failed) return { error: "Not sent: the chat is not in this room yet. Try again in a moment." };
  if (composed.kind === "long") return { error: `Too long by ${bytes(composed.over)}.` };
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
  /** Sends the draft; whether it went. */
  onSay: (draft: string) => boolean;
}

export function Composer({ room, nick, onSay }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The selection a format leaves, put back in the box once it shows the new draft.
  const selectionRef = useRef<{ start: number; end: number }>(undefined);
  const label = roomLabel(room);
  const composed = compose(room, draft, nick);
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    selectionRef.current = undefined;
    const box = formRef.current?.querySelector("input");
    if (selection === undefined || box === null || box === undefined) return;
    box.focus();
    box.setSelectionRange(selection.start, selection.end);
  }, [draft]);
  const format = (kind: Format) => {
    const box = formRef.current?.querySelector("input");
    const start = box?.selectionStart ?? draft.length;
    const next = formatted({ text: draft, start, end: box?.selectionEnd ?? start }, kind);
    selectionRef.current = { start: next.start, end: next.end };
    setDraft(next.text);
  };
  const send = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (composed.kind !== "line") return;
    const went = onSay(draft);
    setFailed(!went);
    if (went) setDraft("");
  };
  return (
    <form ref={formRef} aria-label={`Write in ${label}`} onSubmit={send}>
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
            {...said(composed, failed)}
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
